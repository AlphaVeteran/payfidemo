# payfidemo 3-Week Plan (Lite)

目标：21 天内交付可提交的 demo。  
范围：**Base Sepolia + Escrow + Mock HSP + Webhook**（x402 可选）。

---

## Week 1（打地基）

1. **冻结范围与环境**
   - 锁定不做项：多链、主网、真实 HSP、争议仲裁。
   - 完成 `.env.example`（`CHAIN_ID=84532` 等）。
2. **完成 Escrow 核心合约**
   - `createAndDeposit`、`releaseBySignatures`、`refund`。
3. **完成最小测试**
   - happy path + 关键失败路径（重放、超额、过期）。
4. **部署到 Base Sepolia**
   - 记录地址、浏览器链接、调用示例。
5. **开源学习与输出**
   - 学：x402、RequestNetwork、Permit2（各抓核心 1-2 点）。
   - 输出：1 篇周复盘长文。

---

## Week 2（中枢系统）

1. **Intent API 跑通**
   - `POST /intents`、`GET /intents/:id`、funding 确认。
2. **双签两阶段接口**
   - `release/prepare` + `release/submit`，对齐 EIP-712。
3. **Mock HSP 可插拔**
   - `MockHSPAdapter` + `hsp_outbox`（日志或表）。
4. **Webhook 可靠投递**
   - `eventId` 幂等、签名、时间戳、基础重试。
5. **全链路联调**
   - 创建意图 -> 充值 -> 释放 -> 回执。

---

## Week 3（产品化与提交）

1. **前端主路径**
   - 创建意图、签名确认、释放结果、退款状态。
2. **可视化与可解释**
   - 显示 `intentId`/`escrowId`/交易链接/回执状态。
3. **可选 x402（加分项）**
   - 仅保护 1-2 条只读 API，开关控制。
4. **提交物完善**
   - README、架构图、演示脚本、FAQ。
5. **冻结与提交**
   - 只修 P0，录 3-5 分钟视频，提交 DoraHacks。

---

## 每日最小节奏（固定）

- 开发：`5h`
- 开源学习：`1.5h`
- 文档更新：`1h`
- 写作素材沉淀：`0.5h`

---

## 每周验收门槛（Gate）

- **W1 Gate**：合约可部署、可测试。  
- **W2 Gate**：API + Mock HSP + Webhook 全链路可跑。  
- **W3 Gate**：前端可演示、文档齐全、可提交。  
