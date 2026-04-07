# WORKLOG

## 架构概览

- 目标：`PayFi` 托管支付演示，主链路是 `Intent -> Funding -> Release -> Refund`，默认演示链为 Base Sepolia，当前本地联调链为 Anvil `31337`。
- 合约层：`contracts/PayFiEscrow.sol`，核心能力包括多 `escrowId`、`createAndDeposit`、EIP-712 双签 `releaseBySignatures`、到期 `refund`、可选 `disputeModule`。
- API 层：`src/server.ts` + `src/routes/intents.ts`，提供支付意图 CRUD、funding 确认、release prepare/submit、refund、debug 接口。
- 状态层：通过 **`intentStore`**（`src/store/intentStore.ts`）统一读写意图；未配置数据库时使用内存（`src/store/memory.js`），配置 **`DATABASE_URL`** 时使用 Postgres（`src/store/postgresIntent.ts` + 启动迁移）。状态覆盖 `awaiting_funding -> active -> partially_settled/settled/refunded`。
- 集成层：`SettlementPort` / `MockSettlementAdapter` / `SettlementOutbox` 事件出站 + webhook stub（含幂等与重放考虑文档），支持链上模式与纯演示模式双轨运行。

## 当前合约地址

- 环境：Anvil 本地链（`chainId=31337`）。
- `PayFiEscrow`：`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`（来源：`.env` + `broadcast/LocalAnvilBootstrap.s.sol/31337/run-latest.json`）。
- `MockERC20 (mUSDC)`：`0x5FbDB2315678afecb367f032d93F642f64180aa3`（来源：`broadcast/LocalAnvilBootstrap.s.sol/31337/run-latest.json`）。
- **Base Sepolia** 演示资产：**Circle 测试 USDC** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`（6 decimals）；前端在 `chainId=84532` 时默认使用该地址（见 `frontend/lib/token-addresses.ts`）。
- **Base Sepolia** `PayFiEscrow`：`0x3FCE185FFF78dDB1120C606A0611e168646a0CeA`（[Basescan Sepolia](https://sepolia.basescan.org/address/0x3FCE185FFF78dDB1120C606A0611e168646a0CeA)）；与根目录 **`.env.example`** 中 **`ESCROW_ADDRESS`** 一致（团队演示用；生产请自部署并改 Variables）。
- 备注：本地 Anvil 与 Base Sepolia 的 **`ESCROW_ADDRESS` / `asset`** 须在各自 **`.env`** 与 Railway Variables 中与链上实例一致，否则 EIP-712 与 **`funding/tx`** 校验会失败。

## 已解决的问题

- 完成 Escrow MVP 合约主能力：创建并托管、按次双签释放、到期退款、事件输出。
- 合约 EIP-712 结构与 API `release/prepare` 对齐，签名字段包含 `agreementHash`，并明确不将 `termsVersion` 放入链上 typed data。
- API 已支持链上模式：`funding/tx` 可从交易回执解析 `EscrowCreated` 并校验 `user/merchant/asset/amount/agreementHash` 一致性。
- API 已支持链上真实交易提交流程：`release/submit` 与 `refund` 在配置 RPC/私钥后可由提交账户发交易并回写本地状态。
- 已提供本地完整联调脚本与步骤：anvil 启动、bootstrap 部署、签名脚本、curl 测试、debug 接口。
- **Base Sepolia** 演示用 **`PayFiEscrow`**（`0x3FCE185…`）已部署，地址写入 **`.env.example`**，并同步 **`README.md`**、**`docs/railway-base-sepolia-deploy.md`** 与「当前合约地址」+ Basescan 链接。

## 待解决的问题

- Railway API（`payfidemo-production`）：**`GET /health`**（**`persistence: postgres`**）、**创建 intent**、**Restart 后同一 `intentId` 仍可 `GET`** 已于 **2026-04-07** 验收记入本 WORKLOG；公网 **链上 funding（`approve` + `createAndDeposit` → `funding/tx`）** 仍可补做。
- 意图与 **settlement outbox** 已支持可选 Postgres 持久化（见 `docs/persistence-postgres.md`）；**webhook 投递记录**等仍缺可靠落库与重试闭环。
- 完成 webhook 投递可靠性闭环：签名/HMAC、重试策略、幂等去重落库与可观测性。
- 完成前端主路径（创建意图、充值提示、双签提交、状态展示、退款操作）并打通演示录屏。
- 评估并按计划决定是否接入 `x402`（建议先保护 1-2 条只读 API，保留环境开关）。

## 绝对不要动

- 不改合约与 API 的 EIP-712 关键域：`name=PayFiEscrowDemo`、`version=1`、`Release` 结构字段顺序。
- 不在链上签名结构中加入 `termsVersion`（仅保留在 intent/webhook 语义层）。
- 不混淆 `intentId` 与 `escrowId`：前者是业务标识，后者是链上托管实例标识。
- 不把真实生产私钥、密钥或敏感配置提交到仓库；`.env` 仅允许本地测试用途。
- 不在截止前扩大范围到多链/主网/完整第三方结算协议真联调，优先保证单链路稳定可演示。

## 当日记录（按日期倒序：最新在上）

## 当日记录（2026-04-07）

【今日完成】
- **Railway API**（公网根域 **`payfidemo-production.up.railway.app`**）：**`GET /health`** 确认 **`ok: true`**、**`chainId`/`walletChainId`: 84532**、**`escrowConfigured: true`**、**`persistence: postgres`**（Neon **`DATABASE_URL`** 在 API Service 生效）；**Deploy Logs** 可见 **`[payfidemo] Postgres persistence enabled (DATABASE_URL)`** 与进程监听 Railway 注入的 **`PORT`**（日志文案仍写 `127.0.0.1`，属控制台提示）。
- **排错与现象**：**`Application failed to respond` / 502**、HTTP 耗时约 **15s** 与 **Neon compute idle**、启动阶段 **`await runMigrations` 完成后才 `listen`** 叠加时的关系；**Deploy Logs** vs **HTTP Logs** 分工；**`GET .../intents/null`** 来自 **POST 失败或非 JSON 时 `jq -r .intentId` 为 `null`**。
- **CDN**：**`/health`** 使用 **`?ts=$(date +%s)`** 等 query 避免 **Fastly** 边缘对 JSON 的缓存导致误判（曾出现 **`persistence: memory`** 旧响应与线上真实状态不一致）。
- **持久化验收**：**Restart/Redeploy** API 后 **`GET /api/payfi/v1/intents/{intentId}`** 仍返回完整 intent；示例记录 **`intentId=307de31b-99a4-45a7-99d9-b173afebcf8d`**，**`createdAt=2026-04-07T04:21:34.908Z`**，**`status=awaiting_funding`**。
- **安全备忘**：**`/health` 字段 `chainRpc`** 含完整 **RPC URL（含 Alchemy key）**，公网可读；已提醒 **轮换密钥** 与后续在代码侧 **脱敏**（当日未改仓库）。

【未完成】
- 公网 **Base Sepolia** 真实 **`funding/tx`**（链上充值回执）一轮冒烟与录屏。
- **`/health` 的 `chainRpc` 脱敏**、Alchemy **密钥轮换**（运维 + 可选代码改动）。

【代码证据】
- 无当日仓库代码变更；验证手段为 **Railway Variables / Neon** 与本地 **`curl`**。

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
