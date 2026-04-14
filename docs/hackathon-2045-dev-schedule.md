# HashKey Chain Horizon Hackathon（DoraHacks #2045）— payfidemo 开发进度表

依据活动页公开时间：[Hackathon Detail](https://dorahacks.io/hackathon/2045/detail)。**以截止日倒推**；若你开工更早，可把相同里程碑整体前移。

| 节点 | 时间（UTC 以页面为准） |
|------|------------------------|
| 提交开放 | 2026/03/10 04:00 |
| **提交截止** | **2026/04/15 12:00** |

**建议主赛道**：**PayFi**（托管 + 支付意图 + Mock HSP + Webhook）；**可选佐证**：并行 **x402**（见 [payfi-escrow-architecture.md](./payfi-escrow-architecture.md)）。**公链演示优先级**：**HashKey Chain Testnet（`chainId=133`）** 为第一优先；**Base Sepolia（`84532`）** 为备选（与历史部署/Railway 对齐时可用）。联调模板：`.env.hashkey.testnet.example`、`docs/CHECKLIST-env-hashkey-local-neon.md`。

---

## 总览（按周）

| 周次 | 日期段（示例） | 目标 | 交付物（可勾选） |
|------|----------------|------|------------------|
| **W0** | 已开赛～本周 | 范围冻结、仓库与 CI、环境变量模板 | Repo、`README` 骨架、`.env.example` / **`.env.hashkey.testnet.example`**、`CHAIN_ID=133`（HashKey Testnet） |
| **W1** | 第 1 整周 | 合约 + 部署 + 最简读写 | Escrow 多 `escrowId`、**HashKey Testnet** 上合约地址与浏览器链接（Base Sepolia 可选）、Foundry/Hardhat 测试通过 |
| **W2** | 第 2 整周 | PayFi API + 结算 outbox + 意图状态机 | `POST/GET intents`、Funding 确认、`MockSettlementAdapter`、`settlement_outbox` 或日志 |
| **W3** | 第 3 整周 | 双签释放 + Webhook + 合同锚点 | EIP-712 `prepare/submit`、HMAC Webhook、幂等 `eventId` |
| **W4** | 第 4 整周 | 前端 +（可选）x402 + 演示 | dApp 主路径录屏可用、402 路由可选开关 |
| **缓冲** | 截止前 2～3 天 | 稳定性、文案、BUIDL 信息 | 无 P0 bug、演示脚本、DoraHacks 提交项齐全 |
| **截止日** | **04/15 12:00 前** | 正式提交 | [Submit BUIDL](https://dorahacks.io/hackathon/2045/detail) 完成 |

---

## 分日进度（倒推示例：从 04/15 往前留缓冲）

若你希望「每日粒度」，可按下面节奏压缩到 **约 3～4 周有效开发**（可按团队人数并行合并任务）。

| 阶段 | 建议时长 | 任务 |
|------|----------|------|
| **P0 范围** | 0.5d | 确定：仅 PayFi 主叙事；**HashKey Testnet** 为主公链（Base Sepolia 备选）；USDC/Mock；HSP Mock；x402 是否做（建议最多 1～2 个 API） |
| **P1 合约** | 2～4d | `createAndDeposit` / `releaseBySignatures` / `refund`；事件；测试网部署；README 写合约地址与浏览器链接 |
| **P2 后端** | 3～5d | 意图 CRUD、`intentId↔escrowId`、funding 确认、`SettlementPort`/Mock、Webhook 投递与重试占位 |
| **P3 签名** | 2～3d | EIP-712 与合约一致；`agreementHash`/`termsVersion` 进 typed data；提交前校验 |
| **P4 前端** | 3～5d | 连接钱包、创建意图、充值、双方确认、签名、展示交易链接 |
| **P5 x402（可选）** | 1～2d | 参考 [coinbase/x402](https://github.com/coinbase/x402) 接一条「402 → 付费再访问」；环境变量开关 |
| **P6 演示与提交** | 2～3d | 3～5 分钟演示视频、架构图一页、赛道说明、开源链接、团队信息 |

---

## 与 DoraHacks 提交项对齐（建议自查清单）

活动页未列出逐字段表单；提交前在平台上逐项核对。常见包括：

- [ ] **项目名称与简介**（英文 + 中文可选）：PayFi + 托管结算 + 可插拔 HSP。
- [ ] **主赛道**：PayFi（强绑定 HashKey Chain 时：在 README 说明当前 **HashKey Chain Testnet（133）演示** 为主路径；若仍保留 Base Sepolia 环境，注明为**备选/历史部署**，并说明 **Escrow 与 `asset` 按链独立配置**，避免评审误解）。
- [ ] **仓库链接**：公开可读；含 `README`、合约地址、环境说明。
- [ ] **演示**：可访问 URL 或录屏（钱包 + 主路径 + Webhook 日志或 Mock 输出）。
- [ ] **技术创新点**：意图状态机、合同锚点、Webhook 幂等、可选 x402。
- [ ] **开发者社区**（页面推荐）：[HashFans](https://hashfans.io/)、[Telegram](https://t.me/HashKeyChainHSK/95285) — 用于问规则与联调，非提交硬性要求。

---

## 风险与砍 scope 顺序（截止紧张时）

1. **先砍**：多链、主网、完整 HSP 真联调、复杂争议模块。  
2. **保留**：一条完整用户路径 + 合约 + Mock HSP + 一次 Webhook 成功投递。  
3. **x402**：有则加分，无则文档说明「并行端口已预留」也可。

---

## 文档索引

- 架构：[payfi-escrow-architecture.md](./payfi-escrow-architecture.md)  
- HashKey Testnet 环境最小项：[CHECKLIST-env-hashkey-local-neon.md](./CHECKLIST-env-hashkey-local-neon.md)  
- 幂等 / Webhook：[payment-flow-idempotency-replay-clock-skew.md](./payment-flow-idempotency-replay-clock-skew.md)
