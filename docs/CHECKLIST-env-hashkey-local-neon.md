# 最小必填项检查表：本地 Frontend + 本地 API + Neon（HashKey 测试网）

## 钉死测试环境的文件（避免混链 / 混 USDC）

| 文件 | 说明 |
|------|------|
| **`.env.hashkey.testnet.example`**（提交到仓库） | **HashKey Testnet 专用模板**：写死 **Chain ID 133**、**RPC**、**USDC `0x8FE3…`**（与前端 `NEXT_PUBLIC_USDC_CONTRACT` 一致）。不含真实密钥。 |
| **`.env.hashkey.testnet`**（默认 gitignore） | 本地/部署：由模板复制后填入 `ESCROW_ADDRESS`、`DATABASE_URL`、网关密钥等。 |
| **`frontend/.env.hashkey.testnet.example`** | 仅 **NEXT_PUBLIC_***，须与根目录同源；复制为 `frontend/.env.local` 使用。 |

联调时请 **`bash scripts/switch-env.sh hashkey`**，脚本会优先从 **`.env.hashkey.testnet.example`** 生成/刷新 `.env.hashkey.testnet`（若模板缺失则回退 `.env.example`）。

适用场景：根目录 `.env` 指向上述 HashKey 配置；数据库为 **Neon**（`DATABASE_URL`）。

---

## 完整复测步骤（HashKey Testnet · 本地 Frontend + 本地 API + Neon）

以下均在仓库根目录 **`/path/to/payfidemo`** 理解路径；终端先 **`cd` 到该根目录**（API 与 `npm run db:migrate` 必须在根目录执行）。

### A. 准备 Neon

1. 在 [Neon](https://neon.tech) 创建项目/分支，复制 **PostgreSQL 连接串**（建议含 `sslmode=require`）。
2. 连接串若含 **`&`**，写入 `.env` 时用**一整行**，或在 shell 里用**单引号**包裹再 `export`，避免被拆断。

### B. 配置根目录 API 环境（HashKey + Neon）

1. **生成/更新**本地 HashKey 配置（任选其一）：
   - **推荐**：`bash scripts/switch-env.sh hashkey`  
     - 首次：从 **`.env.hashkey.testnet.example`** 生成 **`.env.hashkey.testnet`**，并把根目录 **`.env`** 链到该文件。  
     - 若已有 **`.env.hashkey.private`**，脚本会把其中的密钥**覆盖合并**进 `.env.hashkey.testnet`。
   - 或手动：`cp .env.hashkey.testnet.example .env.hashkey.testnet`，再 `rm -f .env && ln -s .env.hashkey.testnet .env`（与脚本效果类似）。
2. 编辑 **`.env.hashkey.testnet`**（或通过 private 文件管理密钥），**至少填齐**：
   - **`DATABASE_URL`** = Neon 连接串（否则 API 用内存库，重启丢数据）。
   - **`ESCROW_ADDRESS`** = 已在 **Chain 133** 部署的 PayFiEscrow（与 `USDC_CONTRACT` 同网）。
   - **`SUBMITTER_PRIVATE_KEY`**（或 `DEPLOYER_PRIVATE_KEY`）：用于代发 `release`/`refund` 等链上交易；对应地址需有 **HSK（gas）**。
   - HashKey 网关：**`APP_KEY` / `APP_SECRET`**、**`MERCHANT_NAME`**、**`MERCHANT_PRIVATE_KEY_PEM` 或 `MERCHANT_PRIVATE_KEY_PATH`** 等（创建支付链接必需）。
3. **本地前端回跳**：若需从 HashKey 收银台回到本机页面，将 **`HASHKEY_REDIRECT_URL`**（或等价配置）设为例如 **`http://127.0.0.1:3000/user`**（按你实际路由调整），勿只填远端 Railway 而本机测支付回跳。
4. 确认模板里已钉死：**`CHAIN_ID=133`**、**`USDC_CONTRACT=0x8FE3…`**；勿改成 Base Sepolia / 其它链地址。

### C. 数据库迁移（首次或换库后）

在**仓库根目录**执行：

```bash
npm install
npm run db:migrate
```

成功则 Postgres 中会有 `payfi_intents` 等表。若报错 `DATABASE_URL is not set`，说明根目录 **`.env`** 未加载到 Neon 连接串（检查 symlink 与文件内容）。

### D. 配置前端（本地只连本地 API）

1. `cp frontend/.env.hashkey.testnet.example frontend/.env.local`  
   （或合并进已有 `frontend/.env.local`。）
2. 确认其中 **`NEXT_PUBLIC_PAYFI_API_URL=http://127.0.0.1:8787`**（无尾斜杠），与本地 API 端口一致。
3. **`NEXT_PUBLIC_*` 链与 USDC** 须与根目录 **`.env`** 中一致（模板已对齐 **133** 与 **`0x8FE3…`**）。
4. 修改过 `NEXT_PUBLIC_*` 后需**重启** `next dev`。

### E. 启动服务（两个终端）

| 顺序 | 目录 | 命令 | 说明 |
|:----:|------|------|------|
| 1 | 仓库根目录 | `npm run dev` | 启动 API，默认 **http://127.0.0.1:8787** |
| 2 | `frontend/` | `npm install`（首次）然后 `npm run dev` | 启动 Next，默认 **http://127.0.0.1:3000** |

### F. 冒烟检查

1. **API**：浏览器或终端访问  
   `http://127.0.0.1:8787/health`  
   - `ok: true`  
   - **`persistence` 为 `postgres`**（若为 `memory` 则未用上 Neon）。
2. **前端**：打开 **`http://127.0.0.1:3000`**，浏览器开发者工具 → **Network**，任意触发列表请求，确认请求发往 **`127.0.0.1:8787`**（而非误指向线上 Railway）。
3. **钱包**：MetaMask 等切换到 **HashKey Chain Testnet（133）**；USDC 为 **ERC20**，余额在 **代币**里查看，与 **HSK** 主币分开。

### G. 常见问题

- **商家页 / 用户页「没有意向」**：API 与前端是否同一 **`NEXT_PUBLIC_PAYFI_API_URL`**；Neon 是否已迁移且 **`DATABASE_URL` 非空**。  
- **创建意向 / 网关报错**：网关密钥、**`HASHKEY_REDIRECT_URL`**、链上 **`ESCROW_ADDRESS`** 是否完整。  
- **释放不上链**：是否配置了 **`SUBMITTER_PRIVATE_KEY`**，且 `health` 里链相关项正常。

---

> **说明**：下列「必填」按「能跑通：创建意向 → 网关支付链接 → 托管/释放链上路径」划分。仅起 API 不连链时，部分链上项可放宽（见文末）。

---

## 一、仓库根目录 `.env`（Node API）

| 变量 | 必填 | 作用 / 备注 |
|------|:----:|-------------|
| `DATABASE_URL` | ✅ | Neon 连接串（建议含 `sslmode=require` 等）；未设则 **内存存储**，重启丢数据。 |
| `CHAIN_ID` | ✅ | 与测试网一致，例如 `133`。 |
| `CHAIN_RPC_URL` | ✅ | 例如 `https://testnet.hsk.xyz`；`getPublicClient` / 钱包 RPC 使用。 |
| `CHAIN_NETWORK` | 建议 | HashKey 网关侧 cart 网络标识；未设可能缺省不当。示例：`hashkey-testnet`（与当前 hashkey 配置一致）。 |
| `USDC_CONTRACT` | ✅ | 测试网 USDC 地址；创建 intent 的 `asset` 须与此一致。 |
| `ESCROW_ADDRESS` | ✅ | 已部署的 PayFi Escrow；`funding/hint`、EIP-712、`release`、`refund` 均依赖。 |
| `SUBMITTER_PRIVATE_KEY` 或 `DEPLOYER_PRIVATE_KEY` | ✅ | 二者其一即可；链上代付 gas（`release`/`refund` 等）。缺则 `isChainMode()` 为 false，释放走演示分支而非真实链上。 |
| `BLOCKSCOUT_URL` | 建议 | 网关对账、交易链接；HashKey Testnet 常用 `https://testnet-explorer.hsk.xyz`。 |
| **HashKey 网关（创建可复用订单 / 支付链接）** | | |
| `HASHKEY_BASE_URL` | ✅ | QA 商户网关 Base URL。 |
| `APP_KEY` | ✅ | `createReusableOrder` / `queryMerchantPayments` 硬性校验。 |
| `APP_SECRET` | ✅ | 同上，用于 HMAC。 |
| `MERCHANT_NAME` | ✅ | `buildMerchantJWT` 要求。 |
| `MERCHANT_PRIVATE_KEY_PEM` **或** `MERCHANT_PRIVATE_KEY_PATH` | ✅ | 二选一；用于 `merchant_authorization` JWT（EC 私钥）。 |
| `HASHKEY_JWT_AUD` | 可选 | 默认 `hgatepay`；与 QA 约定一致即可。 |
| `HASHKEY_MERCHANT_ID` | 可选 | 未设时回退为 `APP_KEY`。 |
| `HASHKEY_REDIRECT_URL` **或** `BASE_URL` | ✅* | 创建可复用订单时必须能拼出 **`redirect_url`**（`HASHKEY_REDIRECT_URL` 优先）。*本地联调*请改为 **`http://127.0.0.1:3000/...`** 或 ngrok HTTPS，勿沿用仅指向远端的 URL，否则支付完成回跳不到本机。 |

**本地联调时建议核对**：

- [ ] `DATABASE_URL` 已在 Neon 控制台复制完整，且已执行 `npm run db:migrate`。
- [ ] `USDC_CONTRACT` 与 `ESCROW` 为**同一套部署/同一网络**（均为 133 测试网）。
- [ ] `SUBMITTER_PRIVATE_KEY` 对应地址在测试网有 **HSK**（gas）且 **USDC** 额度逻辑符合你的测试（submitter 代付 gas，与托管金流无关但交易会失败若无 gas）。

---

## 二、`frontend/.env.local`（Next.js）

| 变量 | 必填 | 作用 / 备注 |
|------|:----:|-------------|
| `NEXT_PUBLIC_PAYFI_API_URL` | ✅ | 本地 API：`http://127.0.0.1:8787`（无末尾 `/`）。不设则默认也是该地址，**显式写出**可避免误指向 Railway。 |
| `NEXT_PUBLIC_CHAIN_ID` | ✅ | 须与后端 `CHAIN_ID` 一致，例如 `133`。 |
| `NEXT_PUBLIC_CHAIN_RPC_URL` | ✅ | 须与后端 RPC 一致，例如 `https://testnet.hsk.xyz`。 |
| `NEXT_PUBLIC_USDC_CONTRACT` | ✅ | 须与根目录 **`USDC_CONTRACT` 完全相同**（创建/展示默认 asset）。 |
| `NEXT_PUBLIC_BLOCK_EXPLORER_URL` | 建议 | 例如 `https://testnet-explorer.hsk.xyz`；「查看交易」链接。 |

**检查**：

- [ ] 前端 `NEXT_PUBLIC_*` 与根目录链上变量 **无拼写不一致**（尤其 USDC 地址）。
- [ ] 修改 `NEXT_PUBLIC_*` 后已 **重启** `next dev`。

---

## 三、启动顺序（简表）

与上文 **「E. 启动服务」**、**「F. 冒烟检查」** 一致：**迁移 → 根目录 `npm run dev` → `frontend` `npm run dev` → `/health` 确认 `persistence: postgres`**。

---

## 四、可选 / 场景相关

| 变量 | 何时需要 |
|------|----------|
| `PAYFIDEMO_DEBUG=true` | 仅本机需要 `POST .../debug/intents/:id/expire` 时。 |
| `WEBHOOK_TIMEOUT_MS` | 调 webhook 超时；有默认值时可不填。 |
| `X402_ENABLED` | 与 x402 相关实验；默认 `false` 即可。 |
| `BASE_URL` | 若不使用 `HASHKEY_REDIRECT_URL`，且需 `redirect_url=${BASE_URL}/payment/result` 时；本地通常优先 `HASHKEY_REDIRECT_URL`。 |

---

## 五、不写入本检查表的内容

- `APP_KEY` / `APP_SECRET` / `SUBMITTER_PRIVATE_KEY` / 商户 PEM 等 **不得在仓库或截图中提交**；仅在本地与部署平台保管。  
- `.env.hashkey.testnet` 若含 **Railway 专用** 的 `BASE_URL` / `HASHKEY_REDIRECT_URL`，复制到「本地 + 本地 API」场景时，请 **改写为 localhost 或 ngrok**，否则行为与预期不一致。
