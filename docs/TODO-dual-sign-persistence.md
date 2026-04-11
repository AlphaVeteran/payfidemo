# TODO：双签持久化策略（分析备忘）

> 状态：**设计讨论 / 未实现**  
> 目的：记录「仅临时保存当前轮双签」与「追加保留每次签名历史」的取舍，供后续产品与技术决策。

---

## 背景：当前实现（临时保存）

- 双签字段：`IntentRecord.userSig` / `merchantSig`，与整条 intent 一并写入 `payfi_intents.payload`（JSONB）。
- **一轮释放成功**或链上 nonce 自洽同步后，调用 `clearReleaseSignatures`，清空上述两字段；状态以 `releaseCount` / `releasedTotal` / `releaseNonce` / `status` 为准。
- **含义**：库内双签是「当前这一轮、准备 `release/submit` 前的协作缓存」，不是审计日志。

相关代码：`src/routes/intents.ts`（`POST .../release/signatures`、`POST .../release/submit`、`clearReleaseSignatures`）。

---

## 需求区分（决策前必须对齐）

| 代号 | 需求 | 说明 |
|------|------|------|
| **A** | 审计 / 合规 / 客服 | 每次保存签名时，将 hex + 上下文（`intentId`、`releaseNonce`、角色、时间等）**追加**存储，**只增不改**（或仅标记作废）。 |
| **B** | 用历史签名再次上链 | 一般**不应**作为目标：EIP-712 与链上 `releaseNonce` 绑定，旧 nonce 的签名在链上无效；与安全模型冲突。 |

产品若说「保留每次签名」，通常指 **A**；实现上应明确：**历史签名 = 只读留痕**；**当前可提交的一对**仍可沿用现有字段或单独「当前草稿」概念。

---

## 利弊对比

### 仅临时保存（现状）

**利**

- 模型简单：单表 intent payload，无额外表与复杂迁移。
- 与链上一致：成功释放后清缓存，减少误用「过期」签名的歧义。
- 隐私与合规：少存敏感数据，保留策略更简单。

**弊**

- 无法还原「某时刻谁提交过哪段 hex」用于争议或审计。
- 无法统计「同一 nonce 下改签次数」等。

### 追加持久化（每次签名一条历史）

**利**

- 可审计、可排障、可扩展报表与导出。
- 与「当前轮缓存」可分离：历史只增，不替代链上规则。

**弊**

- 存储与敏感数据治理：访问控制、保留期限、删除策略、可选加密。
- API 暴露面：若列表接口带出历史，泄露风险上升；需默认脱敏或独立鉴权接口。
- 实现与迁移成本：新表/迁移、旧数据无历史时的策略。

---

## 若实现「历史签名」时的改动方向（概要）

- **数据**：新增 append-only 表（示例名）`payfi_release_signature_events`，字段含 `intent_id`、`role`、`signature`、`release_nonce`、`created_at` 等；`POST .../release/signatures` 成功后 insert；`clearReleaseSignatures` **不删除**该表。
- **API**：列表/详情默认不返回完整历史；按需 `GET .../release/signature-history`（鉴权）。
- **前端**：可选仅内部/调试展示；公网展示需脱敏。
- **运维**：备份权限、TTL、合规审查。

---

## TODO（待办清单）

### 产品 / 合规

- [ ] 确认目标为 **A（审计留痕）** 而非 **B（重放旧签）**。
- [ ] 历史签名 **是否对终端用户可见**，还是仅运营/内部。
- [ ] **保留期限**：永久 vs 滚动 N 天 vs 按 intent 生命周期删除。
- [ ] **合规**（含 GDPR 等）：是否将签名视为个人相关数据并写入隐私政策。

### 技术

- [ ] 定表结构：`payfi_release_signature_events`（或等价）字段与唯一约束（是否允许同一 `(intent_id, release_nonce, role)` 多条以记录改签）。
- [ ] 迁移脚本与 Neon/Railway 部署顺序。
- [ ] `GET /intents` 等接口确保 **不**默认泄露历史 hex；新增只读历史接口的鉴权方案。
- [ ] （可选）对 `signature` 列应用层加密、定期清理 Job。

### 文档

- [ ] 实现后在本文件顶部更新状态为「已实现」，并链接到 ADR 或 API 文档。

---

## 参考

- 代码：`src/routes/intents.ts`、`src/types.ts`（`IntentRecord`）、`src/store/postgresIntent.ts`。
