# PayFIDemo：Base Sepolia + Railway（API + 前端）+ Neon 部署指南

本文说明如何将 **后端 Express API** 与 **Next.js 前端** 同部署在 **Railway**，链为 **Base Sepolia（chainId `84532`）**，持久化使用 **Neon Postgres**。仓库内相关配置：

- 根目录 [`railway.toml`](../railway.toml)：`node dist/server.js`，`/health` 健康检查
- [`frontend/railway.toml`](../frontend/railway.toml)：Next.js，`next start` 绑定 `0.0.0.0`

---

## 1. 前置条件

- **Neon**：已创建项目/数据库，可复制 **`DATABASE_URL`**（保留 `sslmode=require` 等查询参数）。
- **钱包与资产**
  - **部署合约**：本地或 CI 使用 Foundry 时的 `PRIVATE_KEY`（勿提交仓库）。
  - **服务端代发交易**：`SUBMITTER_PRIVATE_KEY` 或 `DEPLOYER_PRIVATE_KEY`（与 [`.env.example`](../.env.example) 一致）；对应地址在 **Base Sepolia** 上需有 **测试 ETH**（支付 `release` / `refund` 的 gas）。
  - **测试用户 / 商家**：需有 Sepolia ETH + 选用的 **`asset`**（如测试 USDC），并对 Escrow 做 **`approve`**。
- **代码**：`feat/base-sepolia`（或已合并同等配置的 `main`）含上述 `railway.toml` 文件。

---

## 2. 部署顺序

建议按下列顺序执行，避免前端构建时缺少 API 公网地址。

### 2.1 链上：在 Base Sepolia 部署 PayFiEscrow

在本地执行（私钥仅本机环境变量）：

```bash
export PRIVATE_KEY=0x...   # 勿写入仓库
export RPC_URL=https://sepolia.base.org   # 或使用带 API Key 的 RPC
cd payfidemo
forge script script/DeployPayFiEscrow.s.sol:DeployPayFiEscrow \
  --rpc-url "$RPC_URL" --broadcast
```

- 将部署得到的 **Escrow 合约地址** 写入 Railway API 服务的 **`ESCROW_ADDRESS`**。
- **仓库示例**：根目录 [`.env.example`](../.env.example) 已填入一次 Base Sepolia 部署的 **`PayFiEscrow`**：`0x3FCE185FFF78dDB1120C606A0611e168646a0CeA`（[Basescan](https://sepolia.basescan.org/address/0x3FCE185FFF78dDB1120C606A0611e168646a0CeA)）。可与该值一致以复用同一合约，或改为你们自部署的地址。
- 创建 intent 时的 **`asset`** 必须与链上使用的代币地址一致。Base Sepolia 建议使用 **Circle 测试 USDC**：`0x036CbD53842c5426634e7929541eC2318f3dCF7e`（**6 decimals**，见 [Circle USDC 合约列表](https://developers.circle.com/stablecoins/usdc-contract-addresses)）。
- 可选：在 [Basescan Sepolia](https://sepolia.basescan.org) **验证合约**，便于排查。

### 2.2 Neon

- 在 [Neon Console](https://console.neon.tech) 复制 **`DATABASE_URL`**。
- **无需手工建表**：API 进程启动时会执行 `runMigrations()`（见 [`docs/persistence-postgres.md`](persistence-postgres.md)）。
- 可选预检：本地执行  
  `DATABASE_URL='postgresql://...' npm run db:migrate`

### 2.3 Railway 服务一：API（仓库根目录）

1. [Railway](https://railway.app) 新建 Project → **Deploy from GitHub** → 选择 **payfidemo** 仓库。
2. 第一个 Service：**Root Directory 留空**（使用仓库根目录）。
3. 在 **Variables** 中配置（名称与 [`.env.example`](../.env.example) 对齐）：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Neon 连接串 |
| `CHAIN_ID` | `84532` |
| `CHAIN_RPC_URL` | `https://sepolia.base.org` 或 Alchemy / Infura 等带 Key 的 URL（公网建议带 Key，减轻限流） |
| `ESCROW_ADDRESS` | 2.1 步部署的地址；可与 [`.env.example`](../.env.example) 中示例 `0x3FCE185…` 相同 |
| `SUBMITTER_PRIVATE_KEY` | 代发 `release` / `refund`；若留空可仅配 `DEPLOYER_PRIVATE_KEY`（行为见代码与 `.env.example`） |
| `PAYFIDEMO_DEBUG` | 公网务必 **`false`** |
| `X402_ENABLED` | 按需，一般为 `false` |

4. 部署完成后记录该 Service 的 **公网 HTTPS 根 URL**，例如 `https://payfidemo-api.up.railway.app`。
5. 验证：  
   `GET https://<api-host>/health`  
   - `ok: true`  
   - `persistence` 为 **`postgres`**  
   - `chainId` / `walletChainId` 与 **84532** 一致  
   - `escrowConfigured: true`

### 2.4 Railway 服务二：前端（`frontend/`）

1. 同一 Project 内 **Add Service** → 同一 GitHub 仓库。
2. **Settings → Root Directory**：`frontend`。
3. 若未自动读取配置：在 **Config-as-code** 中指定 **`frontend/railway.toml`**（或控制台要求的仓库相对路径，如 `/frontend/railway.toml`）。
4. **Variables**（Next.js 在 **构建阶段** 嵌入 `NEXT_PUBLIC_*`，修改后需 **重新部署** 前端）：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_PAYFI_API_URL` | **仅填 API 根 URL**，**不要**包含 `/api/...` 路径，**不要**末尾多余 `/`（前端代码会自动拼接 `/api/payfi/v1`，见 `frontend/lib/payfi-api.ts`） |
| `NEXT_PUBLIC_CHAIN_ID` | `84532` |
| `NEXT_PUBLIC_CHAIN_RPC_URL` | 与 Base Sepolia 一致；可与后端使用同一 RPC 或单独申请前端用 Key |

5. 部署完成后用浏览器打开前端域名做冒烟测试。

---

## 3. 测试流程

### 3.1 基础设施

- `GET {API}/health`：Postgres、链、Escrow 配置正确。
- 浏览器访问前端，钱包切换到 **Base Sepolia**，链 ID 与 RPC 与变量一致。

### 3.2 主业务路径（与 [README.md](../README.md) 一致）

1. 创建支付意图（`merchant` / `user` 与后续链上地址一致）。
2. **Funding**：对 `asset` **`approve`** → **`createAndDeposit`**（按前端或 `funding/hint` 流程）。
3. `POST .../funding/tx` 上报真实 **`txHash`**。
4. **Release**：`release/prepare` → 用户与商家 **EIP-712 双签** → `release/submit`。
5. **退款**：依赖过期状态；公网 **`PAYFIDEMO_DEBUG=false`** 时调试用 `expire` 接口不可用，勿在公网开启 debug。

### 3.3 持久化验证

1. 创建一个 intent。
2. 在 Railway 对 **API Service** 执行 **Restart**。
3. 再次 `GET` 该 intent 或列表接口 → 数据仍存在则说明 **Neon** 生效。

### 3.4 前后端联调

- API 与前端为不同子域属正常；后端使用 **`cors()`** 默认允许跨域，一般无需额外配置。
- 若请求失败，在浏览器 **Network** 中确认请求基址是否为 **`NEXT_PUBLIC_PAYFI_API_URL`** 所指向的主机。

---

## 4. 注意事项

1. **密钥与数据库 URL**：仅保存在 **Railway Variables** 与本地私有 `.env`，**勿提交 Git**。Neon 轮换密码后同步更新 `DATABASE_URL`。
2. **`NEXT_PUBLIC_*`**：为构建期常量，变更后必须 **重新构建并部署前端**，仅改本地 `.env.local` 不会影响已部署站点。
3. **代发账户 Gas**：`SUBMITTER` / `DEPLOYER` 在 Base Sepolia 上须有足够 **ETH**，否则链上 `release` / `refund` 会失败。
4. **RPC 限流**：公共 `https://sepolia.base.org` 可能被限流；演示/公测建议使用 **带 API Key 的 RPC**。
5. **环境一致性**：`ESCROW_ADDRESS`、`CHAIN_ID`、`CHAIN_RPC_URL` 须与实际部署网络一致；EIP-712 `domain` 与合约不一致会导致签名或交易失败。
6. **Intent 地址**：意图中的 **`user` / `merchant`** 必须与链上 **`createAndDeposit` 调用方** 及双签地址一致。
7. **`PAYFIDEMO_DEBUG`**：生产/公网保持 **`false`**，避免暴露调试接口。
8. **Watch 路径**：根目录与 `frontend/railway.toml` 中配置了 **watchPatterns**，可减少无关目录变更触发的重复部署（详见各文件内注释）。
9. **计费**：Railway、Neon 以官网当前 **定价与试用额度** 为准，注意用量避免服务中断。
10. **Webhook**：若 intent 填写 **`webhookUrl`**，须为 **公网可达** HTTPS；否则仅影响回调，不阻塞链上托管主流程。

---

## 5. 排错速查

| 现象 | 可能原因 |
|------|----------|
| `/health` 中 `persistence: memory` | `DATABASE_URL` 未设置、拼写错误、未保存 Variables 或未 Redeploy |
| 前端无法访问 API | `NEXT_PUBLIC_PAYFI_API_URL` 错误、缺少 `https`、或修改后 **未重新部署前端** |
| 签名 / 交易 chain 错误 | `CHAIN_ID` 非 `84532`，或 RPC 实际连到其他网络 |
| `release/submit` 失败 | 代发账户无 ETH、gas/nonce 问题、合约条件 revert |
| EIP-712 校验失败 | `verifyingContract` 与 `ESCROW_ADDRESS` 不一致，或链 ID 不匹配 |

---

## 6. 相关文档

- [持久化（Postgres / Neon）](persistence-postgres.md)
- [本地 Web3 测试](web3-local-testing-guide.md)
- 项目 [README.md](../README.md)（Anvil、curl 示例、合约说明）
- Railway [Fair Use](https://railway.app/legal/fair-use) / [Monorepo 指南](https://docs.railway.com/guides/monorepo)
