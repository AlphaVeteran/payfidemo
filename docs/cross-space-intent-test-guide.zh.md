# Cross-Space 新建意向测试指导（Core Space + eSpace）

本文档用于指导以下场景的联调与验收：

- Core Space 下单保证金（Fluent）
- Relayer 监听并映射到 eSpace escrow
- eSpace 前端新建合同意向、入金、双签放款与退款（MetaMask）

适用前提：

- Fluent Wallet 用于 Core Space（chainId=1）
- MetaMask 用于 eSpace（chainId=71）
- `admin` / `relayer` / `buyer` / `seller` 均来自同一套助记词（建议不同 account index）

---

## 1. 测试目标与范围

### 1.1 测试目标

验证当前代码实现下，跨空间 PoC 与前端托管流程可稳定跑通：

1. Core `placeOrderDeposit` 成功上链；
2. Relayer 成功监听 `OrderDeposited` 并在 eSpace 调用 `createEscrowFromCore`；
3. 用户可在前端创建 `intent`；
4. 用户完成 eSpace 入金（Approve + Deposit）；
5. 用户与商家完成双签并提交分期放款；
6. 到期后可执行剩余金额退款（可选）。

### 1.2 当前 PoC 边界

- 当前是**事件映射闭环**：`Core 事件 -> eSpace escrow 映射`。
- 暂不包含真实跨空间资金桥接证明与原子搬运。

---

## 2. 角色与职责

- `admin`：环境配置、合约部署/核验、总体控制。
- `relayer`：监听 Core 事件并在 eSpace 执行映射交易。
- `buyer`：发起 Core 下单；在前端创建意向并进行入金/用户签名。
- `seller`：在前端（商家台）进行商家签名并提交放款。

建议：

- 虽同助记词导入，但四个角色使用不同账号地址，避免误操作和权限混淆。

---

## 3. 环境与配置准备

## 3.1 钱包网络准备

### Fluent（Core Space）

- 网络：Conflux Core Testnet
- `chainId = 1`
- RPC：`https://test.confluxrpc.com`
- 浏览器：`https://testnet.confluxscan.net`
- 使用 `buyer`、`admin` 等 Core 侧角色账号

### MetaMask（eSpace）

- 网络：Conflux eSpace Testnet
- `chainId = 71`
- Currency Symbol：`CFX`
- RPC：`https://evmtestnet.confluxrpc.com`
- 浏览器：`https://evmtestnet.confluxscan.io`
- 使用 `buyer`、`seller` 等 eSpace 侧角色账号

## 3.2 合约地址核对（当前配置）

请确保配置与当前部署一致：

### Core Space（下单与保证金）

- Chain ID：`1`

| 合约 | 地址 | 浏览器 |
| --- | --- | --- |
| CoreOrderVault（下单与保证金） | `cfxtest:acfut40t0f72ftzmd0yucxww2m677jwdg6sez5nmxt` | [在浏览器中查看](https://testnet.confluxscan.net/address/cfxtest:acfut40t0f72ftzmd0yucxww2m677jwdg6sez5nmxt) |
| MockERC20（Core · 保证金代币） | `cfxtest:acazrp5f7ff2cnj3w669k8up07wbk7j6cpvsn9sjrc` | [在浏览器中查看](https://testnet.confluxscan.net/address/cfxtest:acazrp5f7ff2cnj3w669k8up07wbk7j6cpvsn9sjrc) |

### eSpace（托管执行层）

- Chain ID：`71`

| 合约 | 地址 | 浏览器 |
| --- | --- | --- |
| PayFiEscrow | `0x44898c384Af98dBB3666E0c0dD9dA643547863a6` | [在浏览器中查看](https://evmtestnet.confluxscan.io/address/0x44898c384Af98dBB3666E0c0dD9dA643547863a6) |
| ESpaceEscrowAdapter | `0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38` | [在浏览器中查看](https://evmtestnet.confluxscan.io/address/0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38) |
| MockERC20（eSpace · 演示资产） | `0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca` | [在浏览器中查看](https://evmtestnet.confluxscan.io/address/0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca) |

## 3.3 环境变量准备

### 根目录（后端/脚本）

1. 切换配置：
  - `npm run env:switch:conflux-testnet`
2. 检查 `.env.conflux.testnet` / `.env.conflux.testnet.private` 至少包含：
  - `CORE_ORDER_VAULT_ADDRESS`
  - `ESPACE_ADAPTER_ADDRESS`
  - `PAYFI_ESCROW_ADDRESS`
  - `RELAYER_PRIVATE_KEY`
  - `BUYER_PRIVATE_KEY`
  - `SELLER_ADDRESS`
  - `CORE_DEPOSIT_ASSET_ADDRESS`

### Conflux 专用 Neon（不要与 HashKey 混用）

> 目标：Cross-Space（Conflux）测试仅使用 Conflux 专用数据库，避免串用 HashKey 历史数据。

1. 在 Neon 新建独立库（建议命名：`payfidemo_conflux_testnet`），不要复用 HashKey 的库或连接串。
2. 将 Conflux 专用连接串写入 `.env.conflux.testnet.private`：

```env
DATABASE_URL='postgresql://<user>:<password>@<host>/<db>?sslmode=require'
```

3. 重新切换环境（让 overlay 生效）：

```bash
bash scripts/switch-env.sh conflux-testnet
```

4. （可选）清空 Conflux 库历史数据后再回归：

```sql
BEGIN;
TRUNCATE TABLE payfi_settlement_outbox;
TRUNCATE TABLE payfi_core_intent_links;
TRUNCATE TABLE payfi_intents;
COMMIT;
```

5. 执行迁移并验证：

```bash
npm run db:migrate
curl -sS http://127.0.0.1:8787/health
```

`/health` 预期包含：

- `chainId: "71"`
- `persistence: "postgres"`
- `databaseProduct: "PostgreSQL"`

若仍显示 `persistence: "memory"`，通常是 API 进程未重启或当前进程未读取到 `DATABASE_URL`。先重启 API，再次验证。

### 前端（`frontend/.env.local`）

确保包含：

- `NEXT_PUBLIC_CHAIN_ID=71`
- `NEXT_PUBLIC_CROSS_SPACE_ENABLED=true`
- `NEXT_PUBLIC_ESCROW_ADDRESS`
- `NEXT_PUBLIC_PAYFI_ESCROW_ADDRESS`
- `NEXT_PUBLIC_ESPACE_ADAPTER_ADDRESS`
- `NEXT_PUBLIC_CORE_ORDER_VAULT_CFX_ADDRESS`（或兼容字段）
- `NEXT_PUBLIC_CORESPACE_CHAIN_ID=1`
- `**NEXT_PUBLIC_CORE_MOCK_ERC20_ADDRESS`**：Core Space **单独部署**的 MockERC20 合约地址（与 eSpace 上 `0x680E…` 非同一条链上的合约）；首页 Core 卡片展示用。未设置时可回退到 `NEXT_PUBLIC_CORE_DEPOSIT_ASSET_ADDRESS`。
- 根目录 `**CORE_DEPOSIT_ASSET_ADDRESS`**：须与上述 Core MockERC20 地址一致，供 `cross-space-demo` 等脚本使用。

### 3.4 Core Space 部署 MockERC20

Core 与 eSpace 合约地址不可混用；保证金在 `CoreOrderVault` 中仅支持 **ERC20**。

```bash
npm run forge:build
# 配置 CORE_RPC_URL、CORE_CHAIN_ID=1、DEPLOYER_PRIVATE_KEY（或 PRIVATE_KEY）
npm run deploy:core-space:mock-erc20
```

部署成功后，将日志中的合约地址写入 `**NEXT_PUBLIC_CORE_MOCK_ERC20_ADDRESS**`（前端）与 `**CORE_DEPOSIT_ASSET_ADDRESS**`（根 `.env`），并重启前端。

### 3.5 给 4 个账户发放测试代币（各 10,000 MockERC20）

为避免“余额不足”影响主流程测试，建议先在两条链分别给测试账户充值。以下命令默认 `MockERC20` 为 **18 位小数**，每个账户发放 `10000 * 10^18`。

#### eSpace（chainId 71）

`cast` 可直接用于 eSpace（EVM RPC）：

```bash
export ESPACE_RPC_URL=https://evmtestnet.confluxrpc.com
export ESPACE_TOKEN=0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca
export PRIVATE_KEY=0x你的私钥

AMOUNT="$(cast --to-wei 10000 ether)"

for addr in \
  0x接收者1 \
  0x接收者2 \
  0x接收者3 \
  0x接收者4
do
  cast send "$ESPACE_TOKEN" \
    "mint(address,uint256)" \
    "$addr" \
    "$AMOUNT" \
    --rpc-url "$ESPACE_RPC_URL" \
    --private-key "$PRIVATE_KEY"
done
```

#### Core Space（networkId 1）

Core Space 公共 RPC 不提供完整 `eth_*` 接口，建议使用本仓库同款 `js-conflux-sdk` 调用：

```bash
cd /Users/amberlu/Documents/payfidemo

export CORE_RPC_URL=https://test.confluxrpc.com
export CORE_CHAIN_ID=1
export CORE_TOKEN=cfxtest:acazrp5f7ff2cnj3w669k8up07wbk7j6cpvsn9sjrc
export PRIVATE_KEY=0x你的私钥

node --input-type=module <<'EOF'
import fs from "node:fs";
import { Conflux } from "js-conflux-sdk";

const recipients = [
  "cfxtest:或0x接收者1",
  "cfxtest:或0x接收者2",
  "cfxtest:或0x接收者3",
  "cfxtest:或0x接收者4",
];
const amount = (10000n * 10n ** 18n).toString();

const artifact = JSON.parse(fs.readFileSync("out/MockERC20.sol/MockERC20.json", "utf8"));
const abi = artifact.abi;
const rpc = process.env.CORE_RPC_URL;
const networkId = Number(process.env.CORE_CHAIN_ID || "1");
const rawPk = process.env.PRIVATE_KEY || "";
const privateKey = rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`;
const token = process.env.CORE_TOKEN;

const cfx = new Conflux({ url: rpc, networkId });
const account = cfx.wallet.addPrivateKey(privateKey);
const contract = cfx.Contract({ abi, address: token });

for (const to of recipients) {
  const txHash = await contract.mint(to, amount).sendTransaction({ from: account.address });
  console.log("tx", txHash);
  let receipt = null;
  while (!receipt) {
    receipt = await cfx.cfx.getTransactionReceipt(txHash);
    if (!receipt) await new Promise((r) => setTimeout(r, 1500));
  }
  if (receipt.outcomeStatus !== 0) {
    throw new Error(`mint failed for ${to}, outcomeStatus=${receipt.outcomeStatus}`);
  }
  console.log("mined", to);
}
EOF
```

> 说明：`CORE_TOKEN` 请填写 Core Space 上单独部署的 MockERC20（例如 `.env` 中的 `CORE_DEPOSIT_ASSET_ADDRESS`）；不要与 eSpace 的 `0x680E...` 混用。

#### 批量校验 4 个地址余额（可选）

发放完成后，可用以下命令快速核对每个地址是否达到预期余额。

**eSpace（`cast call`）**

```bash
export ESPACE_RPC_URL=https://evmtestnet.confluxrpc.com
export ESPACE_TOKEN=0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca

for addr in \
  0x接收者1 \
  0x接收者2 \
  0x接收者3 \
  0x接收者4
do
  raw=$(cast call "$ESPACE_TOKEN" "balanceOf(address)(uint256)" "$addr" --rpc-url "$ESPACE_RPC_URL")
  human=$(cast --from-wei "$raw" ether)
  echo "$addr => $human MOCK (raw=$raw)"
done
```

**Core Space（`js-conflux-sdk`）**

```bash
cd /Users/amberlu/Documents/payfidemo

export CORE_RPC_URL=https://test.confluxrpc.com
export CORE_CHAIN_ID=1
export CORE_TOKEN=cfxtest:acazrp5f7ff2cnj3w669k8up07wbk7j6cpvsn9sjrc

node --input-type=module <<'EOF'
import fs from "node:fs";
import { Conflux } from "js-conflux-sdk";

const recipients = [
  "cfxtest:或0x接收者1",
  "cfxtest:或0x接收者2",
  "cfxtest:或0x接收者3",
  "cfxtest:或0x接收者4",
];

const artifact = JSON.parse(fs.readFileSync("out/MockERC20.sol/MockERC20.json", "utf8"));
const abi = artifact.abi;
const rpc = process.env.CORE_RPC_URL;
const networkId = Number(process.env.CORE_CHAIN_ID || "1");
const token = process.env.CORE_TOKEN;

const cfx = new Conflux({ url: rpc, networkId });
const contract = cfx.Contract({ abi, address: token });

for (const addr of recipients) {
  const bal = await contract.balanceOf(addr);
  const raw = bal.toString();
  const human = Number(raw) / 1e18;
  console.log(`${addr} => ${human} MOCK (raw=${raw})`);
}
EOF
```

---

## 4. 启动步骤（推荐 3 个终端）

### 终端 A：后端 API

```bash
npm run env:switch:conflux-testnet
npm run dev:conflux-testnet
```

### 终端 B：前端

```bash
npm run dev:frontend
```

### 终端 C：Relayer

```bash
npm run relayer:core-to-espace
```

期望日志：

- 出现 relayer 启动日志（如 `started at core block ...`）。
- 后续可观察到 `mapped coreOrder=... tx=...`。
- Core 侧监听基于 `cfx_epochNumber` / `cfx_getLogs`（不是 `eth_*`），可直接对接 `https://test.confluxrpc.com`。

---

## 5. 测试用例（主流程）

## 5.1 用例 A：Core 下单并映射到 eSpace

目标：验证 `CoreOrderVault -> Relayer -> ESpaceEscrowAdapter` 链路。

步骤：

1. Fluent 切换到 `buyer`（Core Testnet）。
2. 新开终端 D 执行：
  - `npm run demo:cross-space`
3. 观察终端输出：
  - demo 终端出现 `core order placed orderId=...`
  - relayer 终端出现 `mapped coreOrder=...`
  - demo 终端出现 `mapped to escrowId=...`

通过标准：

- 三类日志均出现；
- 能得到明确的 `coreOrderId` 与 `escrowId`。

失败排查：

- 若超时：优先确认 relayer 进程是否正常运行；
- 检查 Core/eSpace RPC、Adapter 地址、Relayer 私钥是否正确；
- 检查 `RELAYER_FROM_BLOCK` 是否设置过大导致漏监听。
- 若报 `eth_blockNumber does not exist`：说明仍在使用旧脚本，更新到当前仓库版本后重试。

## 5.2 用例 B：前端新建合同意向（eSpace）

目标：验证用户可在前端创建 `intent`。

### 托管币种（资产）应选什么？

本仓库 **Conflux eSpace Testnet（chainId 71）** 演示路径与 README「已部署合约」一致时，**入金资产应使用与 `PayFiEscrow` 配置相同的 ERC20**，当前文档示例为 **MockERC20**（地址见 README / `frontend/.env.conflux.testnet.example` 中的 `NEXT_PUBLIC_USDC_CONTRACT`）。新建意向时后端会把该地址写入 `intent.asset`，后续 Approve/Deposit 也针对该代币。

- **推荐（与现网示例一致）**：**MockERC20** — 与已部署 `PayFiEscrow`、示例环境变量对齐，联调成本最低。
- **不推荐在本演示里当作默认**：**CFX** — 为原生币；当前前端托管入金路径为 **ERC20 授权 + 转入托管**，与 CFX 无关（Gas 仍用 CFX）。
- **USDC / USDT（含测试网稳定币）**：仅当你们在 **同一链上** 自行部署或配置 `PayFiEscrow` 接受该代币，并把 `NEXT_PUBLIC_USDC_CONTRACT`（及根目录 `USDC_CONTRACT` / `ESCROW_ADDRESS`）改成与白名单一致地址后再测；**不要与 README 示例 MockERC20 混用**。

页面上的「托管总额」在 Base Sepolia / HashKey 等公网测试网场景按 **USDC 小数位** 解析；若你本地前端仍落在 Anvil 或小数位与资产不一致，以 `intent.asset` 与 `demoUsdcDecimals` 实际配置为准。

步骤：

1. MetaMask 切换 eSpace Testnet + `buyer` 账号。
2. 打开首页，进入“我是用户”。
3. 在“新建合同意向”填写：
  - 商家地址：`seller` 地址
  - 托管总额（例：`10`）
  - 分期期数（例：`5`）
  - 托管周期（例：`1` 小时）
4. 点击“新建合同意向”。

通过标准：

- 页面返回并显示 `intentId`；
- 合同状态为 `awaiting_funding`；
- 在用户/商家列表可检索到该 `intentId`。

## 5.3 用例 C：链上入金（Approve + Deposit）

目标：验证 eSpace 托管入金闭环。

步骤：

1. 在用户页 Step 3（链上入金）确认：
  - 钱包地址 = `intent.user`
  - 网络为 eSpace（71）
2. 点击“授权代币”（Approve）并在 MetaMask 确认。
3. 点击“存入托管”（Deposit）并确认。
4. 等待状态刷新。

通过标准：

- 两笔交易成功（至少 Deposit 成功）；
- 状态从 `awaiting_funding` 转为 `active` 或 `partially_settled`；
- 可在浏览器查看最近交易哈希。

## 5.4 用例 D：双签分期放款

目标：验证用户签名 + 商家签名 + 提交放款。

步骤：

1. 用户签名：
  - MetaMask 使用 `buyer`，在用户页 Step 4 点击“用户签名”。
2. 商家签名：
  - 切换 MetaMask 到 `seller`；
  - 进入商家控制台，选择同一 `intentId`，完成商家签名。
3. 提交放款：
  - 在可提交端点击“提交分期放款”。
4. 重复执行，直到达到期数上限或进入目标状态。

通过标准：

- `releaseNonce` 和 `releaseCount` 递增；
- `releasedTotal` 增长；
- 最终状态可达到 `settled`（视金额和期数）。

## 5.5 用例 E（可选）：到期退款

目标：验证 escrow 到期后可退回剩余金额。

步骤：

1. 确保 intent 状态为 `active`/`partially_settled` 且存在剩余金额。
2. 等待超过 `expiresAt`。
3. 用户页 Step 5 点击“剩余金额退回”。

通过标准：

- 退款交易成功；
- 状态变更为 `refunded`（或可观测到剩余金额已退回用户地址）。

---

## 6. 验收记录模板（建议复制使用）


| 项目        | 结果    | 关键证据                      |
| --------- | ----- | ------------------------- |
| Core 下单   | 通过/失败 | Core Tx Hash              |
| eSpace 映射 | 通过/失败 | Adapter Tx Hash           |
| 新建 intent | 通过/失败 | intentId                  |
| 入金        | 通过/失败 | Approve/Deposit Tx        |
| 双签放款      | 通过/失败 | Release Tx + releaseCount |
| 到期退款（可选）  | 通过/失败 | Refund Tx                 |


建议同时记录：

- `coreOrderId`
- `escrowId`
- `intentId`
- Core 与 eSpace 浏览器链接

---

## 7. 常见问题与处理

### 7.1 `CoreOrderMapped` 等待超时 / `cross-space demo failed (code 1)` 逐步排查

下列现象同源：`npm run demo:cross-space` 或前端触发的 cross-space demo 子进程在 **`DEMO_WAIT_MS`**（例：`waitMs=600000`）内未观察到映射；stderr 含 **`timeout waiting CoreOrderMapped event`**；经 API 包装时可能形如 **`cross-space demo failed (code 1) timeout waiting CoreOrderMapped event | orderId=… | waitMs=… | pollMs=… | apiBase=…`**，并提示查看 relayer 日志。

**脚本在等什么（满足其一即成功退出）**

1. **链上**：对 `ESPACE_ADAPTER_ADDRESS` 做 eSpace `eth_getLogs`，命中带索引的 `CoreOrderMapped`，且 `coreOrderId` 等于本次 **`DEMO_ORDER_ID`**（未设置时多为 `Date.now()`）。
2. **API**：`GET /api/payfi/v1/intents/core-links/by-core-order/:coreOrderId` 能返回 **`escrowId`**（通常由 Relayer `POST .../core-links/mapped` 写入）。

二者在整段等待期内都不成立时，进程以 **code 1** 结束；RPC、扫描节奏、回调是否成功都会抖动，故可能表现为**间歇、无明显规律**。

**建议按顺序核对**

1. **Relayer 日志**（同一 `orderId`）  
   - 是否出现 `[relayer] scan epoch …`、`mapped coreOrder=…`、`linked coreOrder=…`，或 **`already processed … notified API`**（已映射仅补写后端）。  
   - 若出现 **`[relayer] failed order=…`**：多为 `createEscrowFromCore` revert（见本节下文「relayer 报 `processed` / `createEscrowFromCore` 回退」：`processed`、`NotRelayer`、代币/授权、`totalMismatch`、`expires` 等）。  
   - 若已有 **`mapped coreOrder=…`** 但**没有** `linked coreOrder=…`：可能是映射交易已上链，但 Relayer 在 receipt 所在块内解析 `CoreOrderMapped` 失败，**未调用** `POST .../mapped`；此时 demo 仅依赖自身的 `getLogs`；若 eSpace RPC 同时抽风，两条路径都可能为空直至超时。
2. **eSpace 浏览器**  
   - 该 `coreOrderId` 是否已有 **`createEscrowFromCore`** / **`CoreOrderMapped`** 交易；若没有，问题在 Core 扫描或链上调用失败，而非 demo 轮询本身。
3. **API 是否已有映射**（端口按本机 API 修改）  
   - `GET http://127.0.0.1:8787/api/payfi/v1/intents/core-links/by-core-order/<coreOrderId>`  
   - 若链上已映射但此处长期 **404**：重点查 **`PAYFI_API_URL`** 是否与 API 实际地址一致（含 **`PORT`**：未设则 demo 默认 `http://127.0.0.1:8787`），以及 Relayer 是否 **`POST .../mapped` 失败**（非 2xx 会在 relayer 侧抛错）。
4. **环境变量与权限**  
   - **`PAYFI_API_URL`**：Relayer、跑 API 的机器、以及 **`cross-space-demo` 子进程**（继承服务端 `process.env`）应指向**同一** API 根 URL。  
   - **`ESPACE_ADAPTER_ADDRESS`**、**`RELAYER_PRIVATE_KEY`** 对应地址须在链上 **`isRelayer`**；Core 端点须支持 **`cfx_*`**（如 `https://test.confluxrpc.com`）。
5. **参数与合约约束**  
   - **`DEMO_*`** 须满足托管合约约定（例如 **`amountTotal == maxReleases * amountPerLesson`**、**`expiresAt > block.timestamp`** 等）；与链上已存在的 **`coreOrderId`** 冲突时可能表现为 **`processed`**（无新事件），见下条与 §9。

**与 `intentId` 的关系**：界面上的 **`intentId`**（UUID）与 Core 侧 **`orderId` / `coreOrderId`** 在 PoC 中为弱绑定；排查时请始终以报错中的 **`orderId=`**、relayer 日志与浏览器为准，不要仅用 intent 是否存在判断映射是否完成。

**相关环境变量简述**

| 变量 | 作用 |
| --- | --- |
| `DEMO_WAIT_MS` | `cross-space-demo` 等待映射的最长时间（须小于服务端 **`CROSS_SPACE_DEMO_TIMEOUT_MS`** 的合理余量）。 |
| `DEMO_POLL_MS` | 轮询间隔（报错里的 `pollMs`）。 |
| `PAYFI_API_URL` | Demo 与 Relayer 回调 API 的根 URL；与 **`PORT`** 不一致时易写错实例。 |
| `ESPACE_RPC_URL` | eSpace `getLogs` 不稳时，终端可能出现 `[demo] getLogs error`，可更换节点重试。 |

---

- 钱包网络不一致  
  - 现象：按钮不可点或交易失败  
  - 处理：MetaMask 切 71，Fluent 切 1；确认当前操作链与页面提示一致。
- 角色地址不一致  
  - 现象：提示“当前钱包必须是合同用户/商家”  
  - 处理：切换到对应角色账号再操作。
- relayer 无映射日志 / demo 等不到 `CoreOrderMapped`  
  - 现象：`demo:cross-space` 或 cross-space demo 任务失败，超时等待 `CoreOrderMapped`（详见 **§7.1** 逐步排查）。  
  - 处理：先按 **§7.1** 核对 relayer、浏览器、API `by-core-order`、**`PAYFI_API_URL`/`PORT`** 与 RPC；并确认 Core 端点支持 `cfx_*`（如 `https://test.confluxrpc.com`）。
- relayer 报 `processed` / `createEscrowFromCore` 回退  
  - 现象：日志中出现 `revert: processed` 或 viem 提示该调用因 `processed` 失败；同时 **`cross-space demo` 长时间轮询后报 `cross-space demo status polling timed out`**（或后端子进程等映射超时）。  
  - 原因：`ESpaceEscrowAdapter` 对每个 **`coreOrderId` 只允许映射一次**（`processedOrderId[coreOrderId]`）。Relayer **重启后从较早 epoch 重扫**、或同一笔 Core `OrderDeposited` 被处理两次时，第二次链上会按设计回退，**不会产生新的 `CoreOrderMapped`**；若此时也未向后端补写映射，demo 会一直等。  
  - 处理：  
    1. 使用当前仓库的 `scripts/relay-core-to-espace.mjs`：对已处理的订单先 **`readContract(processedOrderId)`**，若已为真则读 **`escrowIdByCoreOrderId`** 并 **`POST /api/payfi/v1/intents/core-links/mapped`** 补关联，**不再重复发** `createEscrowFromCore`。  
    2. 新开一轮演示时，在 API 环境更新 **`DEMO_ORDER_ID`**（或留空以使用时间戳），避免与链上已存在的订单号冲突。  
    3. 确认 Relayer 的 **`PAYFI_API_URL`** 与创建 intent / 跑 demo 的 API 一致，否则回调写错实例。  
- 浏览器 / Scan 已能看到映射交易，但 demo 仍报超时  
  - 原因：旧版 `cross-space-demo.mjs` 在 **Core 入金前** 就固定了 eSpace `fromBlock`，`eth_getLogs` 查询跨度过大时，公共 RPC 常返回空结果，即使链上已有 `CoreOrderMapped`。  
  - 处理：使用当前仓库脚本（入金**之后**再锚定 `fromBlock`）；若仍失败，看终端是否出现 `[demo] getLogs error` 并换 `ESPACE_RPC_URL` 重试。
- relayer 启动即报 RPC method 不存在  
  - 现象：`eth_blockNumber does not exist / is not available`  
  - 处理：拉取最新代码并确认 `scripts/relay-core-to-espace.mjs` 已切换到 Core `cfx_*` 调用（若本地有旧缓存进程，请先重启 relayer）。
- `cross-space demo is already running`  
  - 现象：点击“缴纳保证金 / 自动流程”时，接口返回已有任务正在运行。  
  - 处理：先查看返回里的 `taskId`，再调用取消接口：`POST /api/payfi/v1/debug/cross-space/demo/<taskId>/cancel`，取消后重新点击 Demo 按钮（或重新 `POST /api/payfi/v1/debug/cross-space/demo`）。
- intent 查不到  
  - 现象：用户台/商家台无法检索  
  - 处理：确认 `NEXT_PUBLIC_PAYFI_API_URL` 与创建 intent 的环境一致，不要混用本地与线上 API。

---

## 8. 路演建议（5 分钟版本）

建议至少展示以下链上证据：

1. Core 下单交易哈希；
2. eSpace 映射交易哈希；
3. eSpace 入金或放款交易哈希；
4. 一组 `coreOrderId -> escrowId` 映射结果；
5. （可选）一个失败样例，如重放/重复操作被拒绝。

这样可以同时覆盖“跨空间事件闭环 + 托管业务闭环 + 安全性说明”。

---

## 9. 三者关联打通说明（`coreOrderId` / `escrowId` / `intentId`）

当前已实现完整打通：

1. Relayer 在 `createEscrowFromCore` 成功后，读取 `CoreOrderMapped` 事件获得 `escrowId`；若该 `coreOrderId` 已在链上处理过（`processedOrderId` 为真），则不再重复发交易，仅根据 `escrowIdByCoreOrderId` 回调后端补写映射；
2. Relayer 回调后端接口 `POST /api/payfi/v1/intents/core-links/mapped` 写入
  `coreOrderId -> escrowId`；
3. 用户意向完成入金并拿到 `escrowId` 时，后端自动补齐
  `escrowId -> intentId`；
4. 最终形成可查询的三者映射：
  `coreOrderId <-> escrowId <-> intentId`。

### 9.1 查询接口

- 按 Core 订单查：
  - `GET /api/payfi/v1/intents/core-links/by-core-order/:coreOrderId`
- 按 Escrow 查：
  - `GET /api/payfi/v1/intents/core-links/by-escrow/:escrowId`
- 按 Intent 查：
  - `GET /api/payfi/v1/intents/core-links/by-intent/:intentId`

### 9.2 Relayer 回写配置

在根目录 `.env.conflux.testnet` 中设置：

- `PAYFI_API_URL=http://127.0.0.1:8787`

`npm run relayer:core-to-espace` 运行后会自动回写映射。