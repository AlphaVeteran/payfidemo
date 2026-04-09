# Webhook 本地自测说明（无链 demo / Base Sepolia 链上）

本文整理两种本地验证方式：**无链（demo 入金）**与 **Base Sepolia 链上入金**，均验证服务端对 `webhookUrl` 发起真实 **HTTP POST**（头 **`X-PayFi-Event-Id`**、**`X-PayFi-Timestamp`**、**`X-PayFi-Signature`**，body 为 JSON）。实现见 **`src/services/webhookStub.ts`**；超时见 **`.env.example`** 中的 **`WEBHOOK_TIMEOUT_MS`**。

---

## 共同说明

| 项目 | 说明 |
|------|------|
| **触发示例** | 入金确认后事件 **`INTENT_FUNDED`**（`POST .../funding/tx` 成功后） |
| **接收端** | 本机用 Node **`http`** 起的简易服务即可，用于打印请求；非仓库业务代码 |
| **API 进程** | **`npx tsx src/server.ts`** → **Express**（**`src/server.ts`**）挂载 **`src/routes/intents.ts`** |
| **Webhook 投递** | **`dispatchWebhookDemo`** 内 **`fetch`**；失败只打日志，不中断主流程 |

### 与仓库「商户端」（Next `/merchant`）的关系

自测里的**假商户**（本机 echo / 自建 HTTPS）与 GitHub 里的**商户控制台**不是两套并行业务线，而是**不同职责**：

| | 假商户 / 生产中的 Webhook URL | 仓库商户端（`frontend` · `/merchant`） |
|--|------------------------------|----------------------------------------|
| **是什么** | 商户**自有后端**上接收 PayFi **POST** 的地址（自测用本机脚本模拟） | PayFi 演示里**给人用**的页面：查意向、历史、结算 outbox 等 |
| **通信方式** | PayFi API → **服务端对服务端** HTTP 回调 | 浏览器 → PayFi **REST API**（非 webhook 接收方） |
| **是否互斥** | 否。真实场景可**同时**使用：员工用控制台看状态，系统在 **`webhookUrl`** 接事件。当前商户端**不包含** webhook 配置与投递详情的 UI。 |

简言之：**假商户 = 模拟「商户 ERP 的 hook 端点」**；**商户端 = PayFi 提供的演示控制台**。二者互补，不是「二选一的两种商户实现」。

---

## 一、无链（demo）自测

**含义**：不连真实托管回执；**`src/chain/config.ts`** 中 **`isChainMode()`** 为 **`false`**（无 **`CHAIN_RPC_URL` + ESCROW_ADDRESS + 代发私钥`** 等组合）；**`funding/tx`** 使用内存 **`demoEscrowCounter`**，**`txHash`** 可为任意合法 32 字节 hex。

### 1.1 一键脚本

```bash
cd /path/to/payfidemo
bash scripts/webhook-local-selftest.sh
```

- 默认 **echo 端口 `9998`**、**API 端口 `8877`**；可用环境变量覆盖：`ECHO_PORT`、`API_PORT`。
- 脚本开始时会尝试释放上述端口（需 **`lsof`**，macOS 常见）。
- 日志默认：`$TMPDIR/payfi-webhook-echo.log`、`$TMPDIR/payfi-api-selftest.log`（路径因系统而异）。

### 1.2 环境要点（与脚本一致）

在**同一 shell** 中启动 API 时**清空**链上与库（覆盖 `.env` 中已有值，**dotenv 不覆盖已存在的环境变量**）：

```bash
DATABASE_URL= CHAIN_RPC_URL= ESCROW_ADDRESS= DEPLOYER_PRIVATE_KEY= SUBMITTER_PRIVATE_KEY= PORT=8877 npx tsx src/server.ts
```

| 变量 | 作用 |
|------|------|
| **`DATABASE_URL=`** | **`src/db/pool.ts`** → 无 Postgres，**`persistence: memory`** |
| **`CHAIN_RPC_URL=` 等** | **`isChainMode()` → false**，走 demo 入金分支 |
| **`PORT`** | 与默认 **8787** 错开，避免占用冲突 |

### 1.3 分步命令与模块对应

| 步骤 | 命令（示例） | 涉及模块 / 行为 |
|------|----------------|------------------|
| 1 | `node -e '…'` 监听本机端口 | Node **`http`**：假商户端，打印 **POST** body |
| 2 | 上表环境 + `npx tsx src/server.ts` | **`dotenv/config`**、**Express**、**`src/routes/intents.ts`** |
| 3 | `curl http://127.0.0.1:8877/health` | **`GET /health`**；应见 **`"chainMode":false`**、**`"persistence":"memory"`** |
| 4 | `curl -X POST .../api/payfi/v1/intents`（含 **`webhookUrl`** / 可选 **`webhookSecret`**） | **`CreateIntentBody`**（**`src/types.ts`**）、**`intentStore.saveIntent`**；**此时不发 webhook** |
| 5 | `curl -X POST .../intents/<id>/funding/tx` + 合法 **`txHash`** | Demo 分支更新状态；**`settlementAdapter.emit`**；**`await dispatchWebhookDemo`**（**`webhookStub.ts`**） |

### 1.4 验收

- 接收端出现 **`POST /...`**，请求头含 **`x-payfi-event-id`** 等（大小写以 Node 打印为准）。
- API 标准输出或日志文件中有 **`[Webhook:ok] INTENT_FUNDED`**。

---

## 二、Base Sepolia（链上）自测

**含义**：**`isChainMode()`** 为 **`true`**（需 **`.env`** 配置 **`CHAIN_RPC_URL`、`ESCROW_ADDRESS`** 及 **`SUBMITTER_PRIVATE_KEY` 或 `DEPLOYER_PRIVATE_KEY`**）；**`funding/tx`** 通过 **`src/chain/funding.ts`** **`parseEscrowCreatedFromReceipt`** 解析交易回执中的 **`EscrowCreated`**，**`txHash` 必须为真实链上交易**。

### 2.1 前置条件

- 项目根目录 **`.env`**（勿提交私钥到公开仓库）建议包含：
  - **`CHAIN_ID=84532`**（或与 RPC 一致）
  - **`CHAIN_RPC_URL`**、**`ESCROW_ADDRESS`**、**`ASSET_ADDRESS`**（Circle Base Sepolia 测试 USDC）
  - **`USER_PRIVATE_KEY`、`MERCHANT_PRIVATE_KEY`**、**`DEPLOYER_PRIVATE_KEY` 或 `SUBMITTER_PRIVATE_KEY`**
  - 可选 **`DATABASE_URL`**：有则 **`persistence: postgres`**，意图与 outbox 可落库
- 用户地址须有足够测试 **USDC**；**`scripts/local-flow.mjs`** 的 **`fund`** 会在余额不足时由 **deployer** 尝试 **`transfer`** 补给。

### 2.2 一键脚本

```bash
cd /path/to/payfidemo
bash scripts/webhook-base-sepolia-selftest.sh
```

- 默认 **echo `9997`**、**API `8891`**；可用 **`ECHO_PORT`、`API_PORT`** 覆盖。
- 脚本内 **`curl` 创建 intent** 的金额与 **`local-flow fund`** 一致（示例为 10 USDC、5 次释放等）；可按需改脚本内变量。
- 若第一次 **`node scripts/local-flow.mjs fund`** 因 **USDC allowance** 失败，脚本会**再执行一次** **`fund`**（Circle 测试 USDC 常见需 **`approve(0)` 后再 `approve`**）。

### 2.3 分步命令与模块对应

| 步骤 | 命令（示例） | 涉及模块 / 行为 |
|------|----------------|------------------|
| 1 | 同无链：Node **`http`** 接收端 | 本机验证 **POST** |
| 2 | `PORT=8891 npx tsx src/server.ts`（加载 **`.env`**） | **Express** + 链上 **`getPublicClient()`**（**viem**） |
| 3 | `curl .../health` | 应见 **`"chainMode":true`**、**`escrowConfigured":true`** |
| 4 | `node scripts/local-flow.mjs accounts` | **`dotenv`** + **viem** 账户；输出 **user / merchant** 地址供 **`curl` 创建 intent** |
| 5 | `curl -X POST .../intents`（字段与后续 **`createAndDeposit`** 一致，且含 **`webhookUrl`**） | **意图落库**；仍不在此步发 webhook |
| 6 | `BASE=http://127.0.0.1:8891 node scripts/local-flow.mjs fund --intent <intentId>` | **`funding/hint`**（**`encodeFunctionData`** **`createAndDeposit`**）→ **ERC20 `approve`** → **`writeContract` `createAndDeposit`** → **`POST .../funding/tx`** |
| 7 | 服务端处理 **`funding/tx`** | **`parseEscrowCreatedFromReceipt`**（**viem** 回执 + **`EscrowCreated`**）→ 校验与 intent 一致 → **`intentStore.saveIntent`** → **`settlementAdapter.emit`**（+ 可选 **Postgres `appendSettlementOutbox`**）→ **`dispatchWebhookDemo`** |

### 2.4 验收

- 接收端 body 中 **`txHash`** 为真实交易，可在 [Basescan Sepolia](https://sepolia.basescan.org/) 核对。
- 日志中有 **`[Webhook:ok] INTENT_FUNDED`**；若启用 DB，可能另有 **`[SettlementOutbox] INTENT_FUNDED`** 类日志。

---

## 三、两种方式对比

| 项目 | 无链 demo | Base Sepolia 链上 |
|------|-----------|-------------------|
| **`isChainMode()`** | `false` | `true` |
| **典型环境** | 清空 **`CHAIN_RPC_URL`、`ESCROW_ADDRESS`、私钥** 等 | 完整 **`.env`** 链上配置 |
| **`funding/tx`** | Demo 计数器 + 任意合法 **`txHash`** | 解析真实回执，字段必须与 intent 一致 |
| **依赖** | 仅本机 | **RPC**、测试 **ETH/USDC**、与 **`ESCROW_ADDRESS`** 匹配的合约 |
| **脚本** | **`scripts/webhook-local-selftest.sh`** | **`scripts/webhook-base-sepolia-selftest.sh`** |

---

## 四、排障摘要

| 现象 | 可能原因 |
|------|----------|
| **`chainMode` 与预期不符** | **dotenv 不覆盖已导出变量**；请用 **`VAR= npx tsx ...`** 显式清空 |
| **连接 API 失败** | **`tsx` 冷启动较慢**；可轮询 **`/health`** 或延长等待 |
| **链上 `fund`：allowance** | 再执行一次 **`local-flow.mjs fund`**；检查 USDC 对托管合约的 **`approve`** |
| **webhook 无请求** | intent 未带 **`webhookUrl`**；或事件未走到 **`dispatchWebhookDemo`**（如 **`funding/tx` 未成功） |
| **webhook 超时** | 调大 **`WEBHOOK_TIMEOUT_MS`**（见 **`.env.example`**） |

---

## 五、相关代码与脚本索引

| 路径 | 说明 |
|------|------|
| **`src/services/webhookStub.ts`** | 真实 **POST**、超时、**`X-PayFi-*`** 头 |
| **`src/routes/intents.ts`** | 创建 intent、**`funding/tx`**、触发 webhook |
| **`src/chain/config.ts`** | **`isChainMode()`**、**`getPublicClient()`** |
| **`src/chain/funding.ts`** | **`parseEscrowCreatedFromReceipt`** |
| **`scripts/webhook-local-selftest.sh`** | 无链一键自测 |
| **`scripts/webhook-base-sepolia-selftest.sh`** | Base Sepolia 一键自测 |
| **`scripts/local-flow.mjs`** | **`accounts` / `fund`** 等链上辅助流程 |

---

## 六、安全提示

- 勿将含 **私钥**、**数据库 URL** 的 **`.env`** 提交到公开仓库。
- 生产环境商户 **`webhookUrl`** 应为 **公网 HTTPS**；本地自测可用 **127.0.0.1** 或隧道，仅作验证。
