# WORKLOG

## 架构概览

- 目标：`PayFi` 托管支付演示，主链路是 `Intent -> Funding -> Release -> Refund`，默认演示链为 Base Sepolia，当前本地联调链为 Anvil `31337`。
- 合约层：`contracts/PayFiEscrow.sol`，核心能力包括多 `escrowId`、`createAndDeposit`、EIP-712 双签 `releaseBySignatures`、到期 `refund`、可选 `disputeModule`。
- API 层：`src/server.ts` + `src/routes/intents.ts`，提供支付意图 CRUD、funding 确认、release prepare/submit、refund、debug 接口。
- 状态层：当前使用内存存储（`src/store/memory.js`），覆盖 `awaiting_funding -> active -> partially_settled/settled/refunded`。
- 集成层：`MockHSP` 事件出站 + webhook stub（含幂等与重放考虑文档），支持链上模式与纯演示模式双轨运行。

## 当前合约地址

- 环境：Anvil 本地链（`chainId=31337`）。
- `PayFiEscrow`：`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`（来源：`.env` + `broadcast/LocalAnvilBootstrap.s.sol/31337/run-latest.json`）。
- `MockERC20 (mUSDC)`：`0x5FbDB2315678afecb367f032d93F642f64180aa3`（来源：`broadcast/LocalAnvilBootstrap.s.sol/31337/run-latest.json`）。
- 备注：Base Sepolia 地址目前未在仓库文档中落地，后续部署后需同步更新此节与 `README.md`。

## 已解决的问题

- 完成 Escrow MVP 合约主能力：创建并托管、按次双签释放、到期退款、事件输出。
- 合约 EIP-712 结构与 API `release/prepare` 对齐，签名字段包含 `agreementHash`，并明确不将 `termsVersion` 放入链上 typed data。
- API 已支持链上模式：`funding/tx` 可从交易回执解析 `EscrowCreated` 并校验 `user/merchant/asset/amount/agreementHash` 一致性。
- API 已支持链上真实交易提交流程：`release/submit` 与 `refund` 在配置 RPC/私钥后可由提交账户发交易并回写本地状态。
- 已提供本地完整联调脚本与步骤：anvil 启动、bootstrap 部署、签名脚本、curl 测试、debug 接口。

## 待解决的问题

- 补充并固定 Base Sepolia 实际部署地址（含区块浏览器链接），同步到 `README.md` 和提交材料。
- 将当前内存存储替换为持久化存储（至少 `intents`、`hsp_outbox`、`webhook_deliveries`），避免服务重启丢状态。
- 完成 webhook 投递可靠性闭环：签名/HMAC、重试策略、幂等去重落库与可观测性。
- 完成前端主路径（创建意图、充值提示、双签提交、状态展示、退款操作）并打通演示录屏。
- 评估并按计划决定是否接入 `x402`（建议先保护 1-2 条只读 API，保留环境开关）。

## 绝对不要动

- 不改合约与 API 的 EIP-712 关键域：`name=PayFiEscrowDemo`、`version=1`、`Release` 结构字段顺序。
- 不在链上签名结构中加入 `termsVersion`（仅保留在 intent/webhook 语义层）。
- 不混淆 `intentId` 与 `escrowId`：前者是业务标识，后者是链上托管实例标识。
- 不把真实生产私钥、密钥或敏感配置提交到仓库；`.env` 仅允许本地测试用途。
- 不在截止前扩大范围到多链/主网/完整 HSP 真联调，优先保证单链路稳定可演示。
