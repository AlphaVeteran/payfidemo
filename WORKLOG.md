# WORKLOG

## 架构概览

- 目标：`PayFi` 托管支付演示，主链路是 `Intent -> Funding -> Release -> Refund`。**公链演示优先级**：**HashKey Chain Testnet（`chainId=133`）** 为第一优先；**Base Sepolia（`84532`）** 为备选/与既有 Railway 历史部署对齐。本地开发联调链为 Anvil `31337`。
- 合约层：`contracts/PayFiEscrow.sol`，核心能力包括多 `escrowId`、`createAndDeposit`、EIP-712 双签 `releaseBySignatures`、到期 `refund`、可选 `disputeModule`。
- API 层：`src/server.ts` + `src/routes/intents.ts`，提供支付意图 CRUD、funding 确认、release prepare/submit、refund、debug 接口。
- 状态层：通过 **`intentStore`**（`src/store/intentStore.ts`）统一读写意图；未配置数据库时使用内存（`src/store/memory.js`），配置 **`DATABASE_URL`** 时使用 Postgres（`src/store/postgresIntent.ts` + 启动迁移）。状态覆盖 `awaiting_funding -> active -> partially_settled/settled/refunded`。
- 集成层：`SettlementPort` / `MockSettlementAdapter` / `SettlementOutbox` 事件出站 + **Webhook**：对 `webhookUrl` **真实 HTTP POST**（`X-PayFi-*` 头、HMAC、超时 **`WEBHOOK_TIMEOUT_MS`**，见 **`src/services/webhookStub.ts`**）；**`webhook_deliveries` 落库与重试队列**仍属后续项。

## 当前合约地址

- **公链优先级（演示）**：以 **HashKey Testnet（133）** 为主；配置模板见 **`.env.hashkey.testnet.example`**、联调清单见 **`docs/CHECKLIST-env-hashkey-local-neon.md`**（`bash scripts/switch-env.sh hashkey`）。
- **HashKey Chain Testnet**：测试网 USDC（**6 decimals**）**`0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6`**（与前端 `chainId=133` 时默认一致，见 `frontend/lib/token-addresses.ts`）；**`ESCROW_ADDRESS`** 须在 **同一网络**上部署后填入 **`.env.hashkey.testnet`**（勿与 Base Sepolia / Anvil 资产混用）。
- 环境：**Anvil** 本地链（`chainId=31337`）。
- `PayFiEscrow`：`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`（来源：`.env` + `broadcast/LocalAnvilBootstrap.s.sol/31337/run-latest.json`）。
- `MockERC20 (mUSDC)`：`0x5FbDB2315678afecb367f032d93F642f64180aa3`（来源：`broadcast/LocalAnvilBootstrap.s.sol/31337/run-latest.json`）。
- **Base Sepolia（备选）** 演示资产：**Circle 测试 USDC** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`（6 decimals）；前端在 `chainId=84532` 时使用（见 `frontend/lib/token-addresses.ts`）。
- **Base Sepolia（备选）** `PayFiEscrow`：`0x3FCE185FFF78dDB1120C606A0611e168646a0CeA`（[Basescan Sepolia](https://sepolia.basescan.org/address/0x3FCE185FFF78dDB1120C606A0611e168646a0CeA)）；**`.env.example`** 注释中保留该地址供 Base Sepolia 场景对照（当前模板默认 **133** 时 **`ESCROW_ADDRESS`** 应填本网部署；历史 Railway/团队演示；生产请自部署并改 Variables）。
- 备注：各环境的 **`ESCROW_ADDRESS` / `asset`** 须与该环境 **`CHAIN_ID`**、RPC 指向的链上实例一致（Anvil / HashKey 133 / Base Sepolia 勿交叉），否则 EIP-712 与 **`funding/tx`** 校验会失败。

## 已解决的问题

- 完成 Escrow MVP 合约主能力：创建并托管、按次双签释放、到期退款、事件输出。
- 合约 EIP-712 结构与 API `release/prepare` 对齐，签名字段包含 `agreementHash`，并明确不将 `termsVersion` 放入链上 typed data。
- API 已支持链上模式：`funding/tx` 可从交易回执解析 `EscrowCreated` 并校验 `user/merchant/asset/amount/agreementHash` 一致性。
- API 已支持链上真实交易提交流程：`release/submit` 与 `refund` 在配置 RPC/私钥后可由提交账户发交易并回写本地状态。
- 已提供本地完整联调脚本与步骤：anvil 启动、bootstrap 部署、签名脚本、curl 测试、debug 接口。
- **Base Sepolia** 演示用 **`PayFiEscrow`**（`0x3FCE185…`）已部署，地址在 **`.env.example`** 注释与 **`README.md`**、**`docs/railway-base-sepolia-deploy.md`**、本 WORKLOG「当前合约地址」+ Basescan 链接中可查（**备选公链**，优先级低于 HashKey Testnet）。

## 待解决的问题

- **公链端到端验收（优先级）**：以 **HashKey Testnet（133）** 为主路径，补 **`approve` + `createAndDeposit` → `funding/tx` → `release` → `refund`** 冒烟并沉淀录屏/WORKLOG 记录；**Base Sepolia** 上同名流程为备选（可与既有 Railway 变量对齐时补做）。
- Railway API（`payfidemo-production`）：**`GET /health`**（**`persistence: postgres`**）、**创建 intent**、**Restart 后同一 `intentId` 仍可 `GET`** 已于 **2026-04-07** 验收记入本 WORKLOG；若线上仍指向 Base Sepolia，**链上 funding** 验收跟随上条「备选」而非主优先级。
- 意图与 **settlement outbox** 已支持可选 Postgres 持久化（见 `docs/persistence-postgres.md`）。**Webhook**：**2026-04-09** 已落地对外真实 POST、超时；自测见 **`docs/webhook-local-selftest.md`**（文内 **「实现状态与 TODO」** 与 **`scripts/webhook-local-selftest.sh`**、**`scripts/webhook-base-sepolia-selftest.sh`**）。**仍待** 平台侧 **投递记录表**、**失败自动重试**、**幂等落库** 等进阶能力（商户 ERP 侧验签与幂等约定见 **`docs/webhook-local-selftest.md`**）；**HashKey Testnet** 专用 webhook 一键脚本未提供（可沿用 **`dispatchWebhookDemo`** 与链上流程自行验证）。
- 完成前端主路径（创建意图、充值提示、双签提交、状态展示、退款操作）并打通演示录屏。
- 评估并按计划决定是否接入 `x402`（建议先保护 1-2 条只读 API，保留环境开关）。

## 绝对不要动

- 不改合约与 API 的 EIP-712 关键域：`name=PayFiEscrowDemo`、`version=1`、`Release` 结构字段顺序。
- 不在链上签名结构中加入 `termsVersion`（仅保留在 intent/webhook 语义层）。
- 不混淆 `intentId` 与 `escrowId`：前者是业务标识，后者是链上托管实例标识。
- 不把真实生产私钥、密钥或敏感配置提交到仓库；`.env` 仅允许本地测试用途。
- 不在截止前扩大范围到多链/主网/完整第三方结算协议真联调；**公链演示以 HashKey Testnet 单链路稳定可演示为第一优先**。

## 当日记录（按日期倒序：最新在上）

## 当日记录（2026-04-14）

【今日完成】
- **Conflux Cross-Space（Core -> eSpace）端到端实测通过**：完成 `CoreOrderVault`、`ESpaceEscrowAdapter`、`PayFiEscrow` 部署；修复部署/联调链路中的多项阻塞（Core Space RPC 与 EVM RPC 混用、部署脚本私钥变量名不一致、Conflux eSpace 对 `PUSH0` 兼容导致部署交易 OOG，`foundry.toml` 固化 `evm_version=paris`、relayer/demo 脚本 RPC 变量优先级修正）；最终跑通 `approve -> core order deposit -> relayer mapping` 全流程并拿到 escrow 映射结果。
- **Cross-Space 关键链上证据已沉淀**（chainId=71）：Approve `0x407e0c9ee6c4a21c3a43e04e93f99993942c5d992970792a87972bfa9ab70dfa`、Core order deposit `0x6c3cde5d1adffb3fd983005ff09c0573a436c4f20ee995fa311c274cfa475bf4`、eSpace mapping `0x300c7ec833c0633cebdc0642d5f9ea303c0525c57cfd77f7b15e2adb3de9edea`；`coreOrderId=1776175312179`，`escrowId=10429080304411244359614541526982370061373641461870929980440368445856475775012`。
- **本地 Cross-Space 配置补齐**：`.env` 回填 `CORE_ORDER_VAULT_ADDRESS=0xAe26E03F8C0E7c8B0ACe8dc8B825A498f8925Fdf`、`ESPACE_ADAPTER_ADDRESS=0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38`、`CORE_DEPOSIT_ASSET_ADDRESS=0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca`；并明确钱包连接网络应为 **eSpace Testnet（71）**（非 Core Space）。
- **线上 `/user` 新建意向 `Failed to fetch` 排查与修复**：定位为前端构建期 `NEXT_PUBLIC_PAYFI_API_URL` 误指向本地（`http://localhost:8787` / `127.0.0.1`）导致 HTTPS 页面请求失败；确认 Railway Base Sepolia API 健康可用（`/health` 返回 `ok: true`、`persistence: postgres`）。在 `frontend/lib/payfi-api.ts` 为 `createIntent` 增加网络异常捕获与环境提示：当基址仍为本地地址时，明确提示需改为公网 `https://<api-host>` 并重新部署前端（`NEXT_PUBLIC_*` 为构建期注入）。
- **Base Sepolia 环境切换**：`scripts/switch-env.sh` 增加 `base-sepolia` 模式（模板 `.env.base.sepolia.example`、可选 overlay `.env.base.sepolia.private`）；根 `.env.example` 补充说明；`package.json` 增加 `env:switch:base-sepolia` / `dev:base-sepolia`。
- **本地前端 ↔ API（Chrome PNA）**：`src/server.ts` 对响应增加 `Access-Control-Allow-Private-Network`，避免 `localhost` 页面请求 `127.0.0.1` API 时 `/health` 与跨域请求被浏览器拦截；`frontend/lib/payfi-api.ts` 默认 API 基址改为 `http://localhost:8787`；新增 **`frontend/.env.base.sepolia.example`** 与根模板字段对齐。
- **链上分期放款状态一致性**：`POST .../release/submit` 在交易确认成功后改为**确定性递增**本地 `releaseNonce` / `releaseCount` / `releasedTotal`（不再依赖交易后立即 `eth_call`，避免 Alchemy 等 RPC 短暂返回旧快照导致 DB 与链不一致）；成功响应体补充 **`intentId`、`releaseNonce`** 等字段，便于前端即时展示。
- **`release/prepare` 自愈**：若出现 `partially_settled` 但 `releaseCount=0` 且 `releasedTotal=0` 的脏状态，自动降回 **`active`**。
- **前端提交流程**：用户工作台与商家侧在「提交分期放款」前调用 `release/prepare` 校验 nonce；提交成功后用户页合并 `ReleaseSubmitResponse` 到当前 `intent`；商家控制台 `reload` 支持 **`releaseSnapshot`** 合并列表行，减少「提交后无更新」观感。

【代码证据】
- `script/DeployCoreOrderVault.s.sol`、`script/DeployCrossSpaceEspace.s.sol`
- `scripts/relay-core-to-espace.mjs`、`scripts/cross-space-demo.mjs`
- `foundry.toml`、`.env`
- `scripts/switch-env.sh`、`.env.base.sepolia.example`、`.env.example`、`.gitignore`、`package.json`
- `src/server.ts`、`src/routes/intents.ts`
- `frontend/.env.base.sepolia.example`、`frontend/.env.example`、`frontend/lib/payfi-api.ts`
- `frontend/components/payfi-demo.tsx`、`frontend/components/merchant/merchant-console.tsx`、`frontend/components/merchant/merchant-release-panel.tsx`

## 当日记录（2026-04-13）

【今日完成】
- **Demo 录屏主任务完成**：今日工作重心为黑客松演示视频录制，已围绕当前主流程完成录屏素材整理与演示口径收敛，覆盖用户侧创建/查询合同意向、支付回跳结果页、商家侧签名与释放相关展示链路。
- **录屏配套文案与界面细节对齐**：同步完善与录屏展示直接相关的界面文案与交互细节，确保演示路径中的术语、按钮命名与页面结构一致，减少口播与页面不一致风险。
- **配置示例与说明同步**：更新环境示例中的说明项，保证录屏期间用于讲解的配置项（链路与环境说明）与仓库现状一致。

【代码证据】
- `frontend/components/home/role-entry.tsx`
- `frontend/components/merchant/merchant-release-panel.tsx`
- `frontend/components/payfi-demo.tsx`
- `docs/HACKATHON-HASHKEY.md`
- `.env.example`

## 当日记录（2026-04-12）

【今日完成】
- **用户工作台（`payfi-demo`）**：「刷新合同意向」改为「查询合同意向」，按钮位于 intentId 输入框左侧；移除「高级选项（Webhook）」整块；合同意向编号与查询区独立成卡并置于「新建托管合同意向」表单之上；界面用语「创建」统一为「新建」（含 `docs/payfidemo_flow_zh.html` 图示文案、`frontend/.env.example` 等）；顶栏移除链横幅 / HSP 手册链接 / API 地址三行，仅保留 Logo 与渐变标题（与商家、详情页头部风格一致）；删除仅用于上述展示的无用文案键与 `payfiApiDisplay`。后续迭代：链上入金预检、HashKey 收银台与双签释放区展示与交互（与 `merchant-release-panel`、`dual-sign-intent-facts`、`hashkey-funding-alternative` 等对齐）。
- **首页（`role-entry`）**：移除「继续上次流程」卡片；HashKey 单卡「HashKey 测试网」：`AddHashKeyNetworkButton` 的 `compact`；展示 **USDC 代币地址**、**托管合约**（`NEXT_PUBLIC_ESCROW_ADDRESS`）、**HashKey Merchant Gateway URL**（`NEXT_PUBLIC_HASHKEY_MERCHANT_GATEWAY_URL`）；下方环境卡标题为 **「payfidemo当前运行环境」**（繁/英对应）；字段含 CHAIN_ID、CHAIN_RPC_URL、Frontend URL、API URL、持久化层；卡内不再展示 `NEXT_PUBLIC_DEMO_MERCHANT`（该变量仍可仅用于表单默认商家）。「用户 / 商家」分段控件在「我是商家」卡片之后。
- **支付回跳与托管登记**：新增 **`/payment/result`**（`intentId` query）；`pickTxHashFromSearchParams` + **`normalizeLooseTxHash`**；若 URL 无链上哈希则请求 **`GET .../gateway-reconciliation`**，用商户 **`gatewayTxSignature`** 与本地 **`fundingTxHash`** 自动 **`POST .../funding/tx`** 或提示已登记。后端 **`appendIntentIdToRedirectUrl`** 与 **`HASHKEY_REDIRECT_URL` / `BASE_URL`** 行为保持文档化（见 env 示例）。
- **HashKey 环境与脚本**：**`.env.hashkey.testnet.example`** 分节整理；说明 **`HASHKEY_REDIRECT_URL` 优先于 `BASE_URL`**、**`.env.hashkey.private` overlay** 会覆盖同名键（曾导致回跳指向线上 `/user`）；**`scripts/switch-env.sh`** 仓库内 **`chmod +x`** 可直连执行；**`docs/CHECKLIST-env-hashkey-local-neon.md`**、根 **`.env.example`** 同步用语。
- **双签元数据**：`IntentRecord` 增加 **`userSigAt` / `merchantSigAt`**（ISO 8601）；`POST/GET .../release/signatures` 返回与清空逻辑一致。
- **商家控制台（`merchant-console`）**：合同意向列表行样式对齐首页「最近记录」；「全部状态」与搜索框紧贴列表上方，签名区与网关对账在列表与分页之后。
- **详情页（`intent-detail`）**：标题与面包屑层级与首页一致（渐变标题、`text-zinc-400` 等）。
- **后端 `/health`**：响应增加 `databaseProduct`（`getDatabaseProductLabel` 按 `DATABASE_URL` 协议推断 PostgreSQL / MySQL 等展示名，不暴露连接串）。
- **前端 `payfi-api`**：导出 `payfiHttpBase`、`getPayFiHealth`、`getGatewayReconciliation` 等；`token-addresses` 等注释用语与「新建」一致。

【代码证据】
- `frontend/app/payment/result/`、`frontend/lib/payment-result-tx.ts`
- `frontend/components/payfi-demo.tsx`、`frontend/components/home/role-entry.tsx`、`frontend/components/merchant/merchant-console.tsx`、`frontend/components/merchant/merchant-release-panel.tsx`、`frontend/components/intent/intent-detail.tsx`
- `frontend/components/shared/add-hashkey-network-button.tsx`、`frontend/components/shared/dual-sign-intent-facts.tsx`、`frontend/components/shared/hashkey-funding-alternative.tsx`
- `frontend/lib/payfi-api.ts`
- `src/hashkey/client.ts`、`src/routes/intents.ts`、`src/types.ts`
- `src/server.ts`、`src/db/pool.ts`
- `scripts/switch-env.sh`、`.env.example`、`.env.hashkey.testnet.example`、`frontend/.env.hashkey.testnet.example`
- `docs/payfidemo_flow_zh.html`、`docs/CHECKLIST-env-hashkey-local-neon.md`

## 当日记录（2026-04-11）

【今日完成】
- **公链优先级调整**：仓库级约定 **公链演示以 HashKey Chain Testnet（`chainId=133`）为第一优先**；**Base Sepolia** 保留为备选及与历史 Railway 部署对齐。已更新本 WORKLOG「架构概览」「当前合约地址」「待解决问题」「绝对不要动」相应表述；既往日记中「优先 Base Sepolia 端到端」的验收目标在优先级上由 **HashKey Testnet** 接棒，历史段落不再逐条改写以免混淆时间线。
- **Hackathon 进度表对齐**：**`docs/hackathon-2045-dev-schedule.md`** 已与上述优先级同步（开篇说明、W0/W1、P0、提交自查「主赛道」、文档索引链至 **`docs/CHECKLIST-env-hashkey-local-neon.md`**）。
- **产品叙事**：统一采用「**链上托管分期放款**」表述（中英繁：`layout` 默认站点说明、`role-entry` 首页卡片与 HashKey 提示、`payfi-demo` 创建意向与双签/提交/Webhook 相关文案、`merchant-release-panel`、`merchant-console` 商家签名区、`intent-detail` 金额进度与下一步指引）；英文主用语为 *on-chain escrow installment disbursement* / *installment disbursement*；链上与 API 字段名仍为 `release` 等，未改协议层。
- **用户工作台布局**：`payfi-demo` 在公网测试网创建意向流程中，「托管总额 / 分期期数 / 托管周期」三处输入使用 `grid-cols-3` 单行并排，输入框加 `min-w-0` 以避免窄宽度下布局溢出。

【代码证据】
- `WORKLOG.md`（公链优先级与合约地址段落）
- `docs/hackathon-2045-dev-schedule.md`
- `frontend/app/layout.tsx`
- `frontend/components/home/role-entry.tsx`
- `frontend/components/payfi-demo.tsx`
- `frontend/components/intent/intent-detail.tsx`
- `frontend/components/merchant/merchant-console.tsx`
- `frontend/components/merchant/merchant-release-panel.tsx`

## 当日记录（2026-04-10）

【今日完成】
- **HashKey 私钥兼容性修复（云部署场景）**：`src/hashkey/jwt.ts` 支持从环境变量读取 **inline PEM**（非文件路径）形式的商户私钥，兼容容器/平台变量注入方式，减少云端启动时因密钥加载方式不一致导致的签名失败。
- **换行转义标准化**：`src/hashkey/jwt.ts` 对环境变量中被转义的 `\n` 做标准化处理，恢复 PEM 多行结构，避免 `-----BEGIN...`/`-----END...` 之间内容因单行化而触发解析错误。
- **环境示例补充**：`.env.example` 新增/完善商户私钥配置示例与注释，明确 inline PEM 的填写方式，降低配置门槛与误配概率。

【未完成】
- 仍需在目标云环境补一轮端到端验证（含实际签名请求）并记录成功样例，确保不同变量注入方式（原始多行、转义单行）都可稳定通过。

【代码证据】
- 提交：`5e78da5`、`ce3fcbe`
- 文件：`src/hashkey/jwt.ts`、`.env.example`

【明日第一任务建议（只能一个）】
- 在云端部署环境执行一次 HashKey 下单/签名最小链路冒烟，记录请求参数形态与成功响应摘要并补记到下一条 WORKLOG。

## 当日记录（2026-04-09）

【今日完成】
- **Webhook 最小可用**：`src/services/webhookStub.ts` 对 `webhookUrl` 发起真实 **`fetch` POST**（沿用 **`X-PayFi-Event-Id` / `X-PayFi-Timestamp` / `X-PayFi-Signature`**），**`AbortController`** 超时（**`WEBHOOK_TIMEOUT_MS`**，见 **`.env.example`**）；失败仅日志，不阻断主流程；**`src/routes/intents.ts`** 各投递点改为 **`await`**。
- **Next 用户工作台**：`frontend/components/payfi-demo.tsx` 创建意向时可选填写 **Webhook URL / Secret**；`frontend/lib/payfi-api.ts` 的 **`IntentRecord`** 增加可选 **`webhookUrl`**（与 API `sanitize` 一致，不含 secret）。
- **文档与自测脚本**：新增 **`docs/webhook-local-selftest.md`**（无链 demo 与 Base Sepolia 链上步骤、模块对照、与 **`/merchant` 商户端职责区分**）；**`README.md`** 增加文档链接；**`scripts/webhook-local-selftest.sh`**、**`scripts/webhook-base-sepolia-selftest.sh`** 支持一键本地验收。

## 当日记录（2026-04-08）

【今日完成】
- **前端信息架构与导航**：`/user`、`/merchant`、`/intent/[intentId]` 顶部导航由纯链接升级为卡片入口，补齐中英文本（home/switch 描述、统一 CTA），减少角色切换与返回首页时的跳转认知成本。
- **商户/用户主流程补强**：`frontend/components/payfi-demo.tsx` 增加退款相关可视化与操作反馈（含剩余额度、到期状态、执行反馈）；`frontend/components/merchant/merchant-console.tsx` 与 `intent-detail.tsx` 对齐新导航与说明文案。
- **前端 API 能力扩展**：`frontend/lib/payfi-api.ts` 新增 `refundIntent(intentId)`，统一前端发起退款提交接口，便于页面复用。
- **后端链上状态一致性增强**：`src/routes/intents.ts` 新增 `escrowSnapshotFromEscrowsRead`，统一解析 `escrows` 读结果；`release/prepare` 与 `release/submit` 增加链上快照自愈/回写，降低多端并发下本地 nonce 与链上状态漂移。
- **脚本稳定性改进**：`scripts/local-flow.mjs` 增加 `ensureErc20Allowance`（先清零再授权），兼容 USDC 等代币在非零 allowance 变更场景，避免联调时授权失败。

【未完成】
- 仍需在 Base Sepolia 公网环境完成一轮真实资金路径（funding/release/refund）冒烟并沉淀截图或录屏证据。

【代码证据】
- `frontend/app/user/page.tsx`
- `frontend/components/intent/intent-detail.tsx`
- `frontend/components/merchant/merchant-console.tsx`
- `frontend/components/payfi-demo.tsx`
- `frontend/lib/payfi-api.ts`
- `src/routes/intents.ts`
- `scripts/local-flow.mjs`
- `WORKLOG.md`

【明日第一任务建议（只能一个）】
- 在 Base Sepolia 公网跑通一条完整示例（create -> funding/tx -> release -> refund），并把关键 `intentId/txHash/状态流转` 记录到下一条 WORKLOG。

## 当日记录（2026-04-07）

【今日完成】
- **Railway API**（公网根域 **`payfidemo-production.up.railway.app`**）：**`GET /health`** 确认 **`ok: true`**、**`chainId`/`walletChainId`: 84532**、**`escrowConfigured: true`**、**`persistence: postgres`**（Neon **`DATABASE_URL`** 在 API Service 生效）；**Deploy Logs** 可见 **`[payfidemo] Postgres persistence enabled (DATABASE_URL)`** 与进程监听 Railway 注入的 **`PORT`**（日志文案仍写 `127.0.0.1`，属控制台提示）。
- **排错与现象**：**`Application failed to respond` / 502**、HTTP 耗时约 **15s** 与 **Neon compute idle**、启动阶段 **`await runMigrations` 完成后才 `listen`** 叠加时的关系；**Deploy Logs** vs **HTTP Logs** 分工；**`GET .../intents/null`** 来自 **POST 失败或非 JSON 时 `jq -r .intentId` 为 `null`**。
- **CDN**：**`/health`** 使用 **`?ts=$(date +%s)`** 等 query 避免 **Fastly** 边缘对 JSON 的缓存导致误判（曾出现 **`persistence: memory`** 旧响应与线上真实状态不一致）。
- **持久化验收**：**Restart/Redeploy** API 后 **`GET /api/payfi/v1/intents/{intentId}`** 仍返回完整 intent；示例记录 **`intentId=307de31b-99a4-45a7-99d9-b173afebcf8d`**，**`createdAt=2026-04-07T04:21:34.908Z`**，**`status=awaiting_funding`**。
- **安全备忘**：**`/health` 字段 `chainRpc`** 含完整 **RPC URL（含 Alchemy key）**，公网可读；已提醒 **轮换密钥** 与后续在代码侧 **脱敏**（当日未改仓库）。
- **代码提交与推送**：提交 **`cf65bc8`**（`feat(i18n): add bilingual UI support and update base sepolia flow`）并已推送至 **`origin/feat/base-sepolia`**；主要包含前端中英双语切换、Base Sepolia 相关演示流与文案对齐、`scripts/check-release.sh` 与 `WORKLOG` 更新。
- **PR**：已创建 **Draft PR #1**（`feat/base-sepolia` -> `main`）：<https://github.com/AlphaVeteran/payfidemo/pull/1>；后续待 Base Sepolia 端到端验收完成后转 **Ready for review** 并合并。

【未完成】
- 公网 **Base Sepolia** 真实 **`funding/tx`**（链上充值回执）一轮冒烟与录屏。
- **`/health` 的 `chainRpc` 脱敏**、Alchemy **密钥轮换**（运维 + 可选代码改动）。

【代码证据】
- 提交：`cf65bc8`（已 push 到 `origin/feat/base-sepolia`）。
- 关键文件：`frontend/components/payfi-demo.tsx`、`frontend/components/home/role-entry.tsx`、`frontend/components/merchant/merchant-console.tsx`、`frontend/components/intent/intent-detail.tsx`、`frontend/components/shared/intent-status-header.tsx`、`frontend/components/ui/language-switcher.tsx`、`frontend/lib/i18n.tsx`、`frontend/lib/wagmi-config.ts`、`src/routes/intents.ts`、`scripts/check-release.sh`、`WORKLOG.md`。
- PR：<https://github.com/AlphaVeteran/payfidemo/pull/1>（Draft）。

【明日第一任务建议（只能一个）】
- 公网跑通 **链上 funding → `POST .../funding/tx`**（真实 **`txHash`**），或优先落地 **`/health` 不返回明文 RPC 密钥**并轮换 Alchemy Key 后重部署。

## 当日记录（2026-04-05）

【今日完成】
- **分支**：继续在 **`feat/base-sepolia`** 上对齐 Base Sepolia 演示资产与前端创建意图体验。
- **前端**：新增 **`frontend/lib/token-addresses.ts`**（Anvil MockERC20 与 Circle Base Sepolia USDC 常量及 **`defaultDemoAssetAddress`**）；**`payfi-demo.tsx`** 在 **`chainId=84532`** 下使用 **`parseUnits`** 将用户输入的 **USDC 十进制总额** 转为 **`amountTotal` / `amountPerLesson`**（按「最大释放次数」整除校验），**`user`** 取已连接钱包地址，**`merchant`** 可选 **`NEXT_PUBLIC_DEMO_MERCHANT`**；Anvil 路径仍用静态默认 **`amountTotal`** 与链上默认 **`asset`**。
- **文档与示例**：**`README.md`** 区分 Anvil 与 Base Sepolia 的 **`asset`** 与最小单位说明；**`docs/railway-base-sepolia-deploy.md`** 写明 Circle 测试 USDC 地址与 6 decimals；**`WORKLOG`**「当前合约地址」补充 Base Sepolia USDC 并区分资产与 Escrow 部署备注。
- **`.env.example`**：可选 **`BASE_URL`**（仅便于 `source` 后冒烟 `curl`，服务端不读）、**`DATABASE_URL`** 占位与 Neon URL 含 **`&`** 时的引号提示、Base Sepolia **`asset`** 注释与 Circle 文档链接。
- **部署脚本**：**`script/DeployPayFiEscrow.s.sol`** 增加 **`privateKeyFromEnv`**，兼容 **`PRIVATE_KEY`** 为 **`0x` 前缀或 64 位十六进制**（与仓库其它 env 风格一致）。
- **本地调试页**：**`web/index.html`** 默认 **Asset** 改为 Base Sepolia Circle USDC 地址（与线上演示资产一致）。
- **Base Sepolia 链上**：已用 **`script/DeployPayFiEscrow.s.sol`** 部署 **`PayFiEscrow`**，地址 **`0x3FCE185FFF78dDB1120C606A0611e168646a0CeA`** 已写入 **`.env.example`** 的 **`ESCROW_ADDRESS`**，并同步 **`WORKLOG`**（当前合约地址）、**`README.md`**、**`docs/railway-base-sepolia-deploy.md`** 与 Basescan 链接。

【未完成】
- Base Sepolia 端到端（领测试 USDC、approve、**`createAndDeposit`**、双签 release）的联调验证与录屏可按需补记；Railway Variables 与公网双服务冒烟仍待按部署文档执行。

【代码证据】
- `frontend/lib/token-addresses.ts`、`frontend/components/payfi-demo.tsx`
- `.env.example`、`README.md`、`WORKLOG.md`、`docs/railway-base-sepolia-deploy.md`
- `script/DeployPayFiEscrow.s.sol`、`web/index.html`

【明日第一任务建议（只能一个）】
- 将 **`ESCROW_ADDRESS`**（`0x3FCE185…` 或自有部署）、**`CHAIN_ID`**、**`CHAIN_RPC_URL`**、**`asset`**（USDC）写入 **Railway** API Variables，按 **`docs/railway-base-sepolia-deploy.md`** 完成 **`GET /health`**（**`persistence: postgres`**）与 **创建 intent → funding** 的公网冒烟。

## 当日记录（2026-04-04）

【今日完成】
- **分支**：在 **`feat/base-sepolia`** 上推进 Base Sepolia 部署准备（相对 **`origin/main`** 跟踪；本地 `.env` 仅本机，不提交）。
- **`.gitignore`**：忽略 **`.env.hashkey.testnet`**、**`.env.local.anvil`**；新增 **`keys/`**，避免商户/网关 PEM 等密钥误入库。
- **Railway（Config as Code）**：根目录 **`railway.toml`** — `RAILPACK`、`watchPatterns`（`src/` / `web/` 等）、**`startCommand`**：`node dist/server.js`、**`healthcheckPath`**：`/health`；**`frontend/railway.toml`** — Next 生产启动 **`npx next start -H 0.0.0.0`**、`/` 健康检查、前端目录 **watchPatterns**；注释说明 monorepo 下 **Root Directory** 与 **`NEXT_PUBLIC_PAYFI_API_URL`**。
- **文档**：新增 **`docs/railway-base-sepolia-deploy.md`**（Base Sepolia 合约部署、Neon、`NEXT_PUBLIC_*` 与 `payfi-api` 根 URL 约定、双 Service 顺序、测试与排错）；**`README.md`** 文档索引增加该链接。
- **`.env.example`**：在 **`DATABASE_URL`** 说明处增加可与多分支共用 Neon 的示例控制台链接（无密钥）。

【未完成】
- Base Sepolia 上 **Escrow 实际地址** 与区块浏览器链接仍待部署后写入 **`WORKLOG` / `README`**。
- Railway / Neon 线上 Variables 与首次公网联调验证待执行（见部署文档）。

【代码证据】
- `railway.toml`、`frontend/railway.toml`、`.gitignore`、`.env.example`、`README.md`、`docs/railway-base-sepolia-deploy.md`

【明日第一任务建议（只能一个）】
- 在 Base Sepolia **部署 PayFiEscrow**，将 **`ESCROW_ADDRESS`** 与 **`asset`** 写入 Railway API Variables，按 **`docs/railway-base-sepolia-deploy.md`** 完成 API + 前端双服务首次部署并 **`GET /health`** 确认 **`persistence: postgres`**。

## 当日记录（2026-04-03）

【今日完成】
- **HashKey Gateway 下单与 webhook 链上登记**
  - 新增 **`src/hashkey/client.ts`**：按意图组装 **x402 v2** cart（USDC、**`pay_to`** 为托管合约）、**`createReusableOrder`** 调用商户 API；请求体使用 **`canonicalStringify`** + HMAC；**`redirect_url`** 由 **`HASHKEY_REDIRECT_URL`** 或 **`BASE_URL`** + **`/payment/result`** 提供。
  - **`POST .../intents`**：**`createReusableOrder`** 成功后回写 **`paymentUrl` / `hskPaymentReqId` / `hskCartMandateId`**，响应增加 **`hashkey`** 与上述字段；失败仍保留已创建意图并记录错误信息。
  - 新增 **`POST /webhooks/hashkey`**（**`src/routes/webhook.ts`**）：校验 **`x-signature`**（**`APP_SECRET`**）、**`x-event-id`** 进程内幂等；**`payment-successful`** 时用 **`tx_signature`** 调 **`registerEscrowOnChain`**（**`src/chain/escrow.ts`**）执行 **`registerDeposit`**，intent 进入 **`active`**；**`payment-failed`** 将状态标为 **`expired`**。
  - **`src/server.ts`**：`express.json` 的 **`verify`** 保存 **`rawBody`** 以支持 webhook 验签。
- **认证与序列化**
  - **`canonicalize`** 库实现规范 JSON 字符串，用于 **`cart_hash`** 与 HMAC body 字节；**`jwt.ts`** 改为手工 ES256K（**`ecdsa-sig-formatter`** + **`crypto.sign`**），与商户侧 **`cart_hash`** 对齐。
  - **`auth.ts`** 注释明确 bodyHash 取自 canonical JSON 的 UTF-8 SHA-256 hex。
- **类型与前端**：**`src/types.ts`**、**`frontend/lib/payfi-api.ts`** 对齐支付链接与 HashKey 请求 id 字段。
- **环境示例与文档**：**`.env.example`**、**`foundry.toml`**、**`docs/HACKATHON-HASHKEY.md`** 将测试网 RPC 统一切到 **`https://testnet.hsk.xyz`**；示例 **`MERCHANT_NAME`** 调整为 **`payfidemo`**；补充 **`BASE_URL` / `HASHKEY_REDIRECT_URL`** 说明。
- **依赖**：新增 **`canonicalize`**、**`ecdsa-sig-formatter`**；移除已无源码引用的 **`jose`**、**`jsonwebtoken`**（与当前手工 ES256K 实现一致）。
- **参考材料**：新增 **`docs/merchant-docs-all-in-one.pdf`**、**`docs/Hashkey_Payment_Deck_CaaS_EN.pdf`**（文档存档；大文件注意 clone 体积）。

【未完成】
- Webhook 幂等依赖进程内 **`Set`**，多副本或重启需持久化或边缘层去重。
- **`registerEscrowOnChain`** 与 **`payment-failed`** 分支的边界（重复处理、结算 outbox）可继续与产品态对齐。
- 建议在具备 QA 凭证与公网 **`BASE_URL`**（如 ngrok）的环境补一条端到端验证摘要。

【验证结果】
- **`npm run typecheck`**：通过（提交前本地执行）。

【代码证据】
- `src/hashkey/client.ts`、`src/hashkey/canonical.ts`、`src/hashkey/jwt.ts`、`src/hashkey/auth.ts`
- `src/routes/intents.ts`、`src/routes/webhook.ts`、`src/chain/escrow.ts`、`src/server.ts`
- `src/types.ts`、`frontend/lib/payfi-api.ts`
- `.env.example`、`foundry.toml`、`docs/HACKATHON-HASHKEY.md`、`package.json`、`package-lock.json`

【明日第一任务建议（只能一个）】
- 公网 API + HashKey QA 跑通 **下单 → 支付成功 webhook → 链上 `registerDeposit`**，并把关键响应与 **`escrowId`** 记入 WORKLOG。

## 当日记录（2026-04-02）

【今日完成】
- **Phase 1：合约适配（Gateway 入金路径）**
  - 在 `contracts/PayFiEscrow.sol` 新增 `registerDeposit`（仅 `submitter` 可调用）与 `EscrowRegistered` 事件。
  - 通过 `liabilityPerAsset` 校验 Gateway 已转入合约的余额是否覆盖本次登记的托管义务，避免多笔意图登记超额。
  - 更新 `PayFiEscrow` 构造函数为 `PayFiEscrow(submitter)`；本地旧路径仍支持 `createAndDeposit`。
  - 新增 `test/PayFiEscrowRegister.t.sol` 覆盖：登记后持币、双签释放、权限/重复 id/余额不足回滚、事件校验。
  - 更新 ABI：`src/abi/payFiEscrow.ts` 补齐 `constructor/submitter/registerDeposit/EscrowRegistered`。
- **部署与 Foundry 配置**
  - 新增 `script/DeployHashKey.s.sol`（HashKey 链部署，使用 `SUBMITTER_PRIVATE_KEY` 优先）。
  - 更新 `script/DeployPayFiEscrow.s.sol` 与 `script/LocalAnvilBootstrap.s.sol` 以适配新构造函数。
  - `foundry.toml` 增加 `hashkey-testnet` rpc endpoint。
- **Phase 2：持久化策略确认**
  - 放弃 SQLite/文件持久化，回到现有方案：仅当设置 `DATABASE_URL` 时启用 Postgres 持久化；未设置则回退内存 Map（与原架构一致）。
- **Phase 3：HashKey 认证层**
  - 新增 `src/hashkey/canonical.ts`（Canonical JSON + `sha256`）、`src/hashkey/auth.ts`（HMAC 头构造）、`src/hashkey/jwt.ts`（ES256K JWT + `jose`）。
  - 安装依赖 `jose`，并完成 `npm run typecheck`。

【未完成】
- HashKey Gateway 对接（Phase 4）：`POST /intents -> createReusableOrder` 以及后续 webhook -> `registerDeposit` 链上登记链路仍待接入（需凭证到位与联调环境稳定性）。

【验证结果】
- `forge fmt` + `forge test -vvv`：`PayFiEscrowRegisterTest` 与原 `PayFiEscrowTest` 全部通过。
- `npm run typecheck`：TypeScript 编译通过。
- （可选）`forge test --fork-url ...` 在当前网络环境可能会出现 RPC 连接失败；这不影响本地合约/逻辑验证。

## 当日记录（2026-04-01）

【今日完成】
- **可选 Postgres 持久化**：`.env` / **`.env.example`** 增加 **`DATABASE_URL`** 说明；依赖 **`pg`**；新增 **`npm run db:migrate`**（`src/db/migrate-cli.ts`）；**`src/server.ts`** 启动时若启用持久化则 **`runMigrations`**，**`/health`** 返回 **`persistence`: `postgres` | `memory`**；进程退出时 **`closePgPool`**，并处理 **SIGINT/SIGTERM**。
- **意图存储抽象**：**`src/store/intentStore.ts`** 在内存与 Postgres 之间切换；**`src/store/postgresIntent.ts`** 与 **`src/db/`**（连接池、事务 **`withPgTransaction`**、迁移 SQL）承载表结构。
- **结算出站重构**：移除 **`src/services/mockHsp.ts`**，改为 **`src/settlement/`**：**`SettlementPort`**、默认 **`MockSettlementAdapter`**（内存 outbox）、**`appendSettlementOutbox` / `getSettlementOutbox`**（Postgres 路径写 **`settlement_outbox`**）；控制台日志 **`logSettlementEvent`**。
- **路由与事务**：**`src/routes/intents.ts`** 全面改为 **`async`** 经 **`intentStore`** 读写；在持久化模式下，**create**、**demo funding**、**demo release/submit**、**demo refund** 等路径对 **intent + outbox** 使用 **同一 PG 事务** 写入（链上成功路径仍 **`settlementAdapter.emit`** 与现有 webhook 行为衔接，细节以代码为准）。
- **调试 API**：新增 **`GET .../debug/settlement-outbox`**；保留 **`/debug/hsp-outbox`** 为兼容别名；**debug expire** 走 **`intentStore`**。
- **文档**：新增 **`docs/persistence-postgres.md`**；**`README.md`**、**`docs/payfi-escrow-architecture.md`**、**`docs/3-week-dev-plan.md`**、**`docs/hackathon-2045-dev-schedule.md`**、流程页与 UI 设计 checklist 等同步术语与路径；删除冗余 **`docs/3-week-dev-plan-lite.md`**。
- **前端**：**`payfi-api`** 使用 **`getSettlementOutboxEvents`** 与 **`SettlementOutboxEvent`**（字段 **`kind`**）；**`intent-detail`** / **`merchant-console`** 时间线与商户历史面板与新 API 对齐。

【未完成】
- **webhook** 可靠投递、Base Sepolia 地址固化、正式演示录屏等待解决问题清单中其余项。
- 建议在配置 **`DATABASE_URL`** 的环境跑一遍 **create → fund → release** 与 **`GET /debug/settlement-outbox`**，并把验证摘要记入下一日 WORKLOG。

【代码证据】
- DB 与迁移：`src/db/pool.ts`、`src/db/migrate.ts`、`src/db/migrate-cli.ts`、`src/db/withTransaction.ts`
- 存储：`src/store/intentStore.ts`、`src/store/postgresIntent.ts`、`src/store/memory.js`（仍为非 PG 默认实现）
- 结算：`src/settlement/settlementPort.ts`、`mockSettlementAdapter.ts`、`settlementOutbox.ts`、`postgresOutbox.ts`、`logSettlementEvent.ts`
- 入口与路由：`src/server.ts`、`src/routes/intents.ts`
- 前端：`frontend/lib/payfi-api.ts`、`frontend/components/intent/intent-detail.tsx`、`frontend/components/merchant/merchant-console.tsx`
- 说明：`docs/persistence-postgres.md`、`README.md`、`.env.example`

【明日第一任务建议（只能一个）】
- 在启用 **`DATABASE_URL`** 的实例上跑通 **`./scripts/reset-local-dev.sh`**（或等价启动）后，用 **`local-flow:run`** 或前端全链路各走一遍，确认 **API 重启后 intent 与 outbox** 仍可查询。

## 当日记录（2026-03-31）

【今日完成】
- 已将当日改动推送 GitHub：`70b9c9d` — `feat(devx): add multi-profile wallet flow and script-driven local testing`（多账户脚本化联调、Chrome 分角色 profile、reset 健康检查、用户/商户控制台与签名路径打磨）。
- 新增 **`scripts/local-flow.mjs`**（viem）：支持 `accounts` / `create` / `fund` / `release` / `release-until-settled` / `run`；在根目录 **`package.json`** 暴露对应 **`local-flow:*`** npm 脚本，便于无 UI 的端到端回归。
- 新增 **`scripts/open-role-profiles.sh`**：按用户/商户隔离 Chrome 用户数据目录，降低同浏览器多钱包会话干扰。
- **`scripts/reset-local-dev.sh`**：补充健康检查与稳定性相关调整，便于一键恢复 Anvil + API 联调环境。
- **前端**：角色入口与独立路由（`/user`、`/merchant`、`/intent/[intentId]`）；**`merchant-console`** / **`intent-detail`** / **`intent-status-header`** 等组件；**`payfi-demo`** 与 **`globals.css`** 调整；**`payfi-api`** 封装扩展；**`layout`** / 首页衔接微调。
- **文档与静态流程页**：**`docs/web3-local-testing-guide.md`**；UI 设计说明 **`docs/ui-design-user-merchant-flow.md`**、**`docs/ui-design-dev-task-checklist.md`**；中英流程 **`docs/payfidemo_flow_en.html`** / **`docs/payfidemo_flow_zh.html`**；**`README.md`**、**`.env.example`** 同步更新。
- **链模块**：**`src/chain/config.ts`** 小幅调整，与本地多账户/脚本联调路径对齐。

【未完成】
- 「待解决的问题」中的 Base Sepolia 地址固化、持久化存储、webhook 可靠投递、正式演示录屏等仍待推进。
- 可在下一工作日补记：`npm run typecheck` 与 **`local-flow:run`**（或分步）最短回归命令与返回摘要。

【代码证据】
- 提交：`70b9c9d`（远程分支与本地一致时可 `git show 70b9c9d --stat` 核对文件列表）。
- 脚本与入口：`scripts/local-flow.mjs`、`scripts/open-role-profiles.sh`、`scripts/reset-local-dev.sh`、`package.json`
- 前端：`frontend/app/user/page.tsx`、`frontend/app/merchant/page.tsx`、`frontend/app/intent/[intentId]/page.tsx`、`frontend/components/home/role-entry.tsx`、`frontend/components/merchant/merchant-console.tsx`、`frontend/components/intent/intent-detail.tsx`、`frontend/components/shared/intent-status-header.tsx`、`frontend/lib/payfi-api.ts`
- 文档：`docs/web3-local-testing-guide.md`、`README.md`、`.env.example`
- 链：`src/chain/config.ts`

【明日第一任务建议（只能一个）】
- 在本机执行一次 **`./scripts/reset-local-dev.sh`** 后跑 **`npm run local-flow:run`**（或 `create → fund → release` 分步），并打开双 profile 走一遍前端签名流程，把关键命令输出记入下一日 WORKLOG。

## 当日记录（2026-03-26）

【今日完成】
- 后端 `intents` 主链路继续完善：围绕 `create -> funding -> release -> refund` 的状态流转、参数校验与链上/本地 demo 双模式分支完成联调收敛。
- `funding/tx` 增强链上一致性校验：基于回执解析 `EscrowCreated` 后，对 `user/merchant/asset/amountTotal/agreementHash` 与 intent 做严格比对，异常返回明确错误信息。
- `release/prepare` + `release/submit` 路径补齐可执行性：增加 releaseNonce 同步检查、提交后 `releaseCount/releasedTotal/status` 回写，并继续触发结算 outbox 与 webhook 事件。
- 本地调试控制台（`web/`）增强：补充 funding 与 release 一键复制命令（calldata / cast / funding curl / prepare-sign-submit pipeline）与状态刷新展示，降低手工串联成本。
- 本地重置脚本 `scripts/reset-local-dev.sh` 升级：支持清理旧进程、启动 anvil、bootstrap 合约、自动回写 `.env` 关键配置并拉起 API，形成一键恢复联调环境流程。
- 新增 `frontend/` Next.js + wagmi 前端工程骨架：已接入钱包连接、create intent、approve+deposit、双签 release、release submit 的主路径页面与 API 封装。
- 产出黑客松倒排计划文档 `docs/hackathon-2045-dev-schedule.md`：明确 W0-W4 目标、交付物、砍 scope 顺序与提交自查项。

【未完成】
- 当日改动尚未形成独立 commit；需整理后按功能维度拆分提交（建议后端/脚本、web 调试台、frontend 初始化分开）。
- `frontend/README.md` 仍为默认模板，需补充本项目实际运行方式、环境变量与演示步骤。
- Base Sepolia 地址落地、持久化存储、webhook 可靠投递闭环等长期项仍待推进。

【代码证据】
- 后端主流程：`src/routes/intents.ts`
- 调试控制台：`web/app.js`、`web/index.html`
- 一键重置脚本：`scripts/reset-local-dev.sh`
- npm 脚本入口：`package.json`
- 前端初始化与流程页：`frontend/package.json`、`frontend/components/payfi-demo.tsx`、`frontend/lib/payfi-api.ts`
- 赛程与里程碑文档：`docs/hackathon-2045-dev-schedule.md`

【明日第一任务建议（只能一个）】
- 先把 `frontend` 从“可跑”推进到“可演示”：补齐项目 README、环境变量说明与一条从创建 intent 到 release submit 的端到端演示脚本（含截图点位）。

## 当日记录（2026-03-25）

【今日完成】
- 修复链上 **`release/submit`** 失败根因 **`invalid chain id for signer`**：`viem/chains` 的 **`localhost` 固定 `chainId=1337`**，与 Anvil 默认 **`31337`** 不一致，导致 `eth_sendRawTransaction` 侧交易 chainId 错误。`src/chain/config.ts` 改为按 **`CHAIN_ID` 解析**（`parseChainIdFromEnv`），**`31337` 路径使用 `foundry` 链定义**；`src/routes/intents.ts` 中 EIP-712 **`release/prepare` 的 `domain.chainId` 与之一致**。
- **`GET /health`** 增加 **`walletChainId`**，用于确认当前进程用于签交易的链 ID（预期 Anvil 为 **31337**）。
- 新增文档 **`docs/api-request-flow.md`**：`GET /health` 与链上 **`POST .../funding/tx`** 的 Express / 路由 / `chain` 模块时序说明（Mermaid）。
- 前端 **Release** 区块：`release-command-buffer` 文本区便于改 **`INTENT_ID`**；**「Refresh state」** 拉取 **`status` / `releaseCount` / `releasedTotal`** 并展示；Create / Query / Funding / 复制 release 命令后触发自动刷新。
- 排查与文档化（对话结论）：**`8787` 业务 API** vs **`8545` JSON-RPC**；`curl` 占位符与端口误用；**内存 intent** 在 **API 重启后丢失**，需重建 intent 再跑 prepare；**`ASSET_ADDRESS`** 由 `reset-local-dev.sh` 写入 **`.env` 备忘**，业务代码不读取；**`sign-release.mjs`** 需 **`source .env`** 提供 **`USER_PRIVATE_KEY` / `MERCHANT_PRIVATE_KEY`**，且须用 **`node scripts/sign-release.mjs`** 执行。
- **Release 全链路回归**：本地 **`release/prepare → sign-release → release/submit`** 成功，返回 **`ok: true`**、**`partially_settled`**、**`releaseCount`** / **`releasedTotal`** 递增、**`chain: true`** 与 **`txHash`**。

【未完成】
- （与前日并列的远期项仍有效）Base Sepolia 地址落地、持久化存储、webhook 闭环、PR 环境、`gh` 网络等。
- Release / refund **演示截图或录屏**仍可按需补入提交材料。

【代码证据】
- `src/chain/config.ts`：链 ID 解析、`foundry` 对齐 `31337`、`getPublicClient` / `getSubmitterWallet` 使用统一 `chainFromEnv`。
- `src/server.ts`：`/health` 增加 **`walletChainId`**。
- `src/routes/intents.ts`：**`parseChainIdFromEnv`** 用于 **`release/prepare`**。
- `docs/api-request-flow.md`：HTTP 与链调用关系图。
- `web/index.html`、`web/app.js`、`web/styles.css`：Release 命令缓冲区、**Refresh state** 与 settlement 字段展示。

【验证结果】
- 命令：`npm run typecheck` → 通过。
- 命令：`curl -sS http://127.0.0.1:8787/health | jq .` → **`walletChainId`: 31337**，**`chainMode`: true**。
- 命令：完整 **`release/prepare` → `node scripts/sign-release.mjs` → `release/submit`**（curl）→ 成功响应示例：**`status`: `partially_settled`**，**`releaseCount`**: 1，**`releasedTotal`** 与 **`amountPerLesson`** 一致，**`txHash`** 非空。

【明日第一任务建议（只能一个）】
- 从 **`partially_settled`** 继续多次 **release** 直至 **`settled`**，并演练 **`refund`**（含 **`PAYFIDEMO_DEBUG`** 下 **`expire`**），最后核对 intent 与链上 **`escrows`** 一致。

【完成定义（2026-03-25 勾选）】
- [x] release/prepare 返回 typedData 且字段与当前 intent 一致
- [x] sign-release 生成 userSig 与 merchantSig 并成功提交 release（链上模式）
- [x] 提交后 intent 的 `releaseCount` 与 `releasedTotal` 正确递增
- [x] 页面 Release 命令块可直接复制执行（须已 `source .env` 且 intent 未因重启丢失）

## 当日记录（2026-03-24）

【今日完成】
- 完成本地测试控制台页面（Create Intent、Query 状态、Funding Hint、Release 命令生成）。
- Funding 区 3 个 Copy 按钮改为“写入下方文本框 + 自动复制”，支持粘贴执行与结果回填。
- 修复并打通链上 funding 主路径：`approve -> createAndDeposit -> funding/tx`，已返回 `status=active`。
- 增强后端稳健性：`funding/tx` 增加 txHash 格式校验，日志序列化支持 BigInt，side-effect 异常不再影响主响应。
- 新增一键环境脚本：`reset-local-dev.sh`（重置启动）与 `stop-local-dev.sh`（停止），并完成一次实际提交与 push（分支已建）。

【未完成】
- 未完成 release 全链路回归（`release/prepare -> sign -> submit` 的完整成功演练与截图沉淀）。
- 未创建成功 GitHub PR（当前环境缺 `gh` 且网络访问 github 受限，已提供手动 PR 链接）。
- 未做前端到期退款与回执可视化的体验优化（仍可用但非最终 demo 级）。

【代码证据】
- 文件：`web/index.html` -> 新增测试控制台结构，增加 Funding 说明、命令缓冲文本框、Release 命令复制入口。
- 文件：`web/app.js` -> 实现 Create/Query/Funding/Release 命令生成；Copy 按钮写入文本框并复制；命令模板加入 PATH/.env。
- 文件：`web/styles.css` -> 新增命令缓冲区样式与交互展示样式。
- 文件：`src/routes/intents.ts` -> `funding/tx` 增加 txHash 严格校验；链上成功路径 side-effect 加防护。
- 文件：`src/server.ts` -> 挂载静态 web 页面；增加端口占用提示与未捕获异常日志。
- 文件：`src/settlement/`（`settlementPort.ts`、`settlementOutbox.ts`、`mockSettlementAdapter.ts`）、`src/services/webhookStub.ts`、`src/util/safeJson.ts` -> 增加安全 JSON 序列化，避免 BigInt 导致日志崩溃。
- 文件：`scripts/reset-local-dev.sh`、`scripts/stop-local-dev.sh` -> 一键重置/停止本地 Anvil + API 环境。
- 文件：`README.md`、`.env.example`、`scripts/sign-release.mjs` -> 同步更新本地联调流程、私钥变量、命令示例与脚本文档。
- 文件：`WORKLOG.md`、`DAILY_AI_WORKFLOW_TEMPLATE.md` -> 纳入本次提交范围并形成流程记录。

【验证结果】
- 命令：`npm run typecheck` -> 结果：通过（TypeScript 检查无错误）。
- 命令：`./scripts/stop-local-dev.sh && ./scripts/reset-local-dev.sh` -> 结果：通过（旧进程关闭、Anvil/API 重启、Chrome 打开首页）。
- 命令：`curl -sS http://127.0.0.1:8787/health` -> 结果：通过（`ok: true`，链上模式配置有效）。
- 命令：`curl -sS -X POST http://127.0.0.1:8787/api/payfi/v1/intents/<id>/funding/tx ...` -> 结果：通过（返回 `{"ok":true,"status":"active","escrowId":"1","chain":true}`）。
- 命令：`git commit ...` -> 结果：通过（提交 `fca2e01`）。
- 命令：`git push -u origin feat/local-devx-console-reset` -> 结果：通过（分支已推送）。
- 命令：`gh pr create ...` -> 结果：失败（本机无 `gh`；随后安装也因网络无法访问 github）。

【明日第一任务建议（只能一个）】
- 完整跑通并录证 `release/prepare -> sign-release -> release/submit` 全链路（含成功返回与 intent 状态变化截图）。

【明日开工可直接使用的 Prompt】
你是我的结对工程师。请严格执行以下流程，不要跳步：

【任务】
完成 PayFi 的 release 全链路验收：`release/prepare -> sign-release -> release/submit`，并输出可复用的验证证据（命令、返回、状态变化截图点位）。

【硬约束】
1. 只允许改这些文件：`web/app.js`、`web/index.html`、`README.md`、`WORKLOG.md`
2. 明确禁止改：`contracts/**`、`src/abi/**`、`src/routes/intents.ts` 的 EIP-712 字段定义、`.env`
3. 不做重构，不新增依赖，不改命名风格
4. 不得输出“建议你去做”，你要直接执行可执行动作

【执行步骤】
1) 先阅读相关代码并输出：
   - 当前实现现状（<=5条）
   - 风险点（<=3条）
   - 最小改动计划（<=7条）
2) 等我回复“继续”后再开始改代码
3) 改完后必须给出：
   - 修改文件清单
   - 每个文件改动目的
   - 剩余风险
4) 运行并汇报验证命令结果：
   - `npm run typecheck`
   - `curl -sS http://127.0.0.1:8787/health`
   - 一次完整 release 命令链（prepare/sign/submit）
   - `GET /api/payfi/v1/intents/:id` 状态核对（releaseCount/releasedTotal）

【完成定义】
- [ ] release/prepare 返回 typedData 且字段与当前 intent 一致
- [ ] sign-release 生成 userSig 与 merchantSig 并成功提交 release
- [ ] 提交后 intent 的 `releaseCount` 与 `releasedTotal` 正确递增
- [ ] README 或页面文案中的 release 命令可直接复制执行且无额外手动修正

（注：以上 checklist 已于 **2026-03-25** 在本地链上模式跑通并记入当日记录。）
