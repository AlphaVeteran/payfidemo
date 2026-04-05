# payfidemo

PayFi 演示后端：支付意图 API、结算消息层（**`SettlementPort`** 接口 + 默认 **`MockSettlementAdapter`**，默认内存 **`SettlementOutbox`**（配置 `DATABASE_URL` 时写 Postgres）+ 控制台 + `GET /api/payfi/v1/debug/settlement-outbox`）、Webhook 演示日志。

**可插拔实现**：当前为本地演示；同一抽象可对接 **HashKey Settlement Protocol（HSP）等** HTTP/SDK——将真实协议封装为实现 `SettlementPort` 的 adapter 即可。

- **未配置链**：`funding/tx` 使用内存 `escrowId`；`release/submit` 为占位。  
- **已配置 Anvil（或任意 RPC）**：设置 `CHAIN_RPC_URL` + `ESCROW_ADDRESS` + `SUBMITTER_PRIVATE_KEY`（或 `DEPLOYER_PRIVATE_KEY`）后，`funding/tx` 解析 `EscrowCreated` 日志；`release/submit` / `refund` **真实发交易**（由 `SUBMITTER/DEPLOYER` 付 gas）。
- **可选 Postgres**：`.env` 中设置 `DATABASE_URL`（如 Neon）后，意图与 settlement outbox 持久化；启动时会自动建表，也可单独执行 `npm run db:migrate`。详见 [docs/persistence-postgres.md](docs/persistence-postgres.md)。

## 环境

- Node.js **≥ 20**
- （可选）**Foundry**：合约编译与测试，见 [lib/README.md](lib/README.md)

安装 Foundry（本机未装时）可参考官方文档：<https://book.getfoundry.sh/getting-started/installation>

## 合约（Foundry）

- 合约：`contracts/PayFiEscrow.sol`（多 `escrowId`、`createAndDeposit`、EIP-712 双签 `releaseBySignatures`、`refund`、可选 `disputeModule`）
- 测试：`test/PayFiEscrow.t.sol`
- 部署脚本：`script/DeployPayFiEscrow.s.sol`（需环境变量 `PRIVATE_KEY`）

```bash
cd payfidemo
# 首次：按 lib/README.md 安装 openzeppelin + forge-std
forge build
forge test
```

部署示例（Base Sepolia 等）：

```bash
export PRIVATE_KEY=0x...   # 勿提交仓库
forge script script/DeployPayFiEscrow.s.sol:DeployPayFiEscrow --rpc-url "$RPC_URL" --broadcast
```

将部署得到的地址写入 `.env` 的 `ESCROW_ADDRESS`，与 API 里 EIP-712 `domain.verifyingContract` 一致。

## Anvil 本地联调（推荐）

终端 A 启动链（同时开 IPC，供 `forge` / `cast` 连接；Node 仍用 `http://127.0.0.1:8545`）：

```bash
cd payfidemo
npm run anvil
# 等价：anvil --host 127.0.0.1 --port 8545 --ipc /tmp/payfi-anvil.ipc
```

终端 B 部署 MockERC20 + PayFiEscrow（需已 `forge install`，见 [lib/README.md](lib/README.md)）：

```bash
cd payfidemo
npm run anvil:bootstrap
# 或手动：forge script script/LocalAnvilBootstrap.s.sol:LocalAnvilBootstrap \
#   --rpc-url /tmp/payfi-anvil.ipc --broadcast --private-key <Anvil 打印的账户 #0 完整私钥>
```

记下输出的 **PayFiEscrow**、**MockERC20** 地址。编辑 `.env`：

```env
CHAIN_ID=31337
CHAIN_RPC_URL=http://127.0.0.1:8545
ESCROW_ADDRESS=<PayFiEscrow 地址>
# deployer/relayer 与 user 分离
DEPLOYER_PRIVATE_KEY=<Anvil 账户 #2 私钥>
SUBMITTER_PRIVATE_KEY=<可选；留空则回退 DEPLOYER_PRIVATE_KEY>
# 与 intent.user / intent.merchant 对应
USER_PRIVATE_KEY=<Anvil 账户 #0 私钥>
MERCHANT_PRIVATE_KEY=<Anvil 账户 #1 私钥>
```

**意图里的 `user` / `merchant` 必须与链上 `createAndDeposit` 的调用一致。** Anvil 默认账户示例：

| 角色 | 地址 |
|------|------|
| 用户（#0） | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| 商家（#1） | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| deployer/relayer（#2） | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

1. `npm run dev` 启动 API。  
2. `POST /intents` 创建意图（**Anvil**：`asset` = 本地 MockERC20 地址；**Base Sepolia**：`asset` = Circle 测试 USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`，6 decimals）。`amountTotal` / `amountPerLesson` 为 **最小单位** 十进制字符串，且满足 `maxReleases * amountPerLesson == amountTotal`。  
3. `GET /intents/:id/funding/hint` 取 `to` / `data`。用户需先对 `asset` **授权** Escrow 划转 `amountTotal`，再 `createAndDeposit`（否则会 `ERC20InsufficientAllowance`）。

较旧的 Foundry 上 `cast send` **没有** `--data`，请用函数签名 + 参数（与 hint 的 `data` 等价）：

```bash
export PATH="$HOME/.foundry/bin:$PATH"
set -a && source .env && set +a
cast send --rpc-url /tmp/payfi-anvil.ipc \
  --private-key "$USER_PRIVATE_KEY" \
  <ASSET_ERC20> \
  "approve(address,uint256)" \
  <ESCROW> \
  <AMOUNT_TOTAL_WEI>

cast send --rpc-url /tmp/payfi-anvil.ipc \
  --private-key "$USER_PRIVATE_KEY" \
  <ESCROW> \
  "createAndDeposit(address,address,uint128,uint128,uint16,uint64,bytes32,address)" \
  <MERCHANT> <ASSET> <AMOUNT_TOTAL_WEI> <AMOUNT_PER_LESSON_WEI> <MAX_RELEASES> <DURATION_SECONDS> \
  <AGREEMENT_HASH_32B> 0x0000000000000000000000000000000000000000
```

> 交互式 zsh 默认不把行首 `#` 当注释；若粘贴带 `#` 的说明行可能报 `command not found: #`，删掉即可或执行 `setopt interactivecomments`。

若已 `foundryup` 到较新版本，也可使用：`cast send ... <ESCROW> --data <hint 返回的 data>`（以你本机 `cast send --help` 是否列出 `--data` 为准）。

4. `POST .../funding/tx` 上报 `txHash`。  
5. `release/prepare` 取 EIP-712（**不含 `termsVersion`**，与合约一致），用户/商家分别签名后 `release/submit`。

### 用脚本签名（Anvil 两把私钥）

私钥请使用 **`anvil` 启动时在终端打印的** `Private Key`（完整 32 字节 hex），勿用手抄截断的短串。

```bash
# payfidemo 根目录；.env 中已配置 USER_PRIVATE_KEY、MERCHANT_PRIVATE_KEY
export PATH="$HOME/.foundry/bin:$PATH"
set -a && source .env && set +a
PREP=$(curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/release/prepare")
SIGS=$(echo "$PREP" | node scripts/sign-release.mjs)
USER_SIG=$(echo "$SIGS" | jq -r .userSig)
MERCHANT_SIG=$(echo "$SIGS" | jq -r .merchantSig)

curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/release/submit" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg u "$USER_SIG" --arg m "$MERCHANT_SIG" '{userSig:$u, merchantSig:$m}')" | jq .
```

（也可临时覆盖：`echo "$PREP" | USER_PRIVATE_KEY=0x.. MERCHANT_PRIVATE_KEY=0x.. node scripts/sign-release.mjs`。）

也可：`npm run sign-release -- prepare.json`（文件内容为 `release/prepare` 的 JSON）。

亦可用 `cast wallet sign` 或前端钱包；脚本便于本地一把梭。

### 用 viem 脚本驱动多账户（无需多钱包窗口）

```bash
# 查看当前角色地址（由 .env 私钥导出）
npm run local-flow:accounts

# 1) 创建意图（merchant/user 自动取自 .env 私钥）
npm run local-flow:create

# 2) 用户账户 approve + createAndDeposit（需传 intentId）
npm run local-flow:fund -- --intent <INTENT_ID>

# 3) user + merchant 本地签名，调用 release/submit
npm run local-flow:release -- --intent <INTENT_ID>
```

## 本地运行

```bash
cd payfidemo
cp .env.example .env
npm install
npm run dev
```

默认监听：`http://127.0.0.1:8787`

`npm run dev` 使用 `tsx watch`，保存文件时会重启进程；若此时正在 `curl`，可能看到 **Empty reply**。联调时可改用 **`npm start`**（无 watch）。请保证 `.env` 的 **`CHAIN_RPC_URL`（如 `http://127.0.0.1:8545`）与 `cast` 所连为同一 Anvil**。

### 一键重置 / 一键停止

```bash
# 关闭旧进程 -> 启动 Anvil -> 重部署 -> 更新 .env -> 启动 API -> 打开独立 Chrome 窗口
./scripts/reset-local-dev.sh

# 关闭本地 Anvil / API 相关进程
./scripts/stop-local-dev.sh
```

## 测试接口（curl）

```bash
export BASE=http://127.0.0.1:8787
```

### 1) 健康检查

```bash
curl -sS "$BASE/health" | jq .
```

### 2) 创建支付意图

```bash
INTENT_JSON=$(curl -sS -X POST "$BASE/api/payfi/v1/intents" \
  -H "Content-Type: application/json" \
  -d '{
    "merchant": "0x2222222222222222222222222222222222222222",
    "user": "0x1111111111111111111111111111111111111111",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amountTotal": "1000000000",
    "amountPerLesson": "100000000",
    "maxReleases": 10,
    "durationSeconds": 2592000,
    "webhookUrl": "https://example.com/hooks/payfi",
    "agreementHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "termsVersion": "1.0.0"
  }')
echo "$INTENT_JSON"
INTENT_ID=$(echo "$INTENT_JSON" | jq -r .intentId)
```

> `agreementHash` 需为 32 字节 hex。上面用全零占位；你可换成真实 keccak256。

### 3a) （链上模式）获取 `createAndDeposit` calldata

```bash
curl -sS "$BASE/api/payfi/v1/intents/$INTENT_ID/funding/hint" | jq .
```

### 3b) 上报充值交易

- **链上模式**：填真实 `createAndDeposit` 的 `txHash`。  
- **纯演示**：可继续用随机 hash（仅内存计数 `escrowId`）。

```bash
curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/funding/tx" \
  -H "Content-Type: application/json" \
  -d '{"txHash":"0x'"$(openssl rand -hex 32)"'"}' | jq .
```

### 4) 准备双签（EIP-712 typed data）

```bash
curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/release/prepare" | jq .
```

### 5) 提交释放（演示：校验签名非空即通过）

```bash
curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/release/submit" \
  -H "Content-Type: application/json" \
  -d '{"userSig":"0x01","merchantSig":"0x02"}' | jq .
```

### 6) 退款（需已过期）

在 `.env` 中加 `PAYFIDEMO_DEBUG=true` 后重启，可将意图设为已过期再调用：

```bash
curl -sS -X POST "$BASE/api/payfi/v1/debug/intents/$INTENT_ID/expire" | jq .
curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/refund" | jq .
```

### 7) Settlement outbox（调试）

```bash
curl -sS "$BASE/api/payfi/v1/debug/settlement-outbox" | jq .
```

（兼容旧路径：`/debug/hsp-outbox` 与上述返回相同 JSON。）

### 8) 列出全部意图

```bash
curl -sS "$BASE/api/payfi/v1/intents" | jq .
```

## 文档

- [架构说明](docs/payfi-escrow-architecture.md)
- [幂等 / Webhook](docs/payment-flow-idempotency-replay-clock-skew.md)
- [三周计划](docs/3-week-dev-plan.md)
- [Base Sepolia + Railway（API/前端）+ Neon 部署](docs/railway-base-sepolia-deploy.md)

## 许可证

MIT（你可按需要修改）
