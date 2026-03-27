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

## 当日记录（按日期倒序：最新在上）

## 当日记录（2026-03-26）

【今日完成】
- 后端 `intents` 主链路继续完善：围绕 `create -> funding -> release -> refund` 的状态流转、参数校验与链上/本地 demo 双模式分支完成联调收敛。
- `funding/tx` 增强链上一致性校验：基于回执解析 `EscrowCreated` 后，对 `user/merchant/asset/amountTotal/agreementHash` 与 intent 做严格比对，异常返回明确错误信息。
- `release/prepare` + `release/submit` 路径补齐可执行性：增加 releaseNonce 同步检查、提交后 `releaseCount/releasedTotal/status` 回写，并继续触发 `MockHSP` 与 webhook 事件。
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
- 文件：`src/services/mockHsp.ts`、`src/services/webhookStub.ts`、`src/util/safeJson.ts` -> 增加安全 JSON 序列化，避免 BigInt 导致日志崩溃。
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
