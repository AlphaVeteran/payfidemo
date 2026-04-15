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
- 使用 `buyer`、`admin` 等 Core 侧角色账号

### MetaMask（eSpace）

- 网络：Conflux eSpace Testnet
- `chainId = 71`
- 使用 `buyer`、`seller` 等 eSpace 侧角色账号

## 3.2 合约地址核对（示例）

请确保配置与当前部署一致（以下为现有示例）：

- `CoreOrderVault`: `0xAe26E03F8C0E7c8B0ACe8dc8B825A498f8925Fdf`
- `ESpaceEscrowAdapter`: `0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38`
- `PayFiEscrow`: `0x44898c384Af98dBB3666E0c0dD9dA643547863a6`
- `MockERC20`: `0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca`

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

### 前端（`frontend/.env.local`）

确保包含：

- `NEXT_PUBLIC_CHAIN_ID=71`
- `NEXT_PUBLIC_CROSS_SPACE_ENABLED=true`
- `NEXT_PUBLIC_ESCROW_ADDRESS`
- `NEXT_PUBLIC_PAYFI_ESCROW_ADDRESS`
- `NEXT_PUBLIC_ESPACE_ADAPTER_ADDRESS`
- `NEXT_PUBLIC_CORE_ORDER_VAULT_CFX_ADDRESS`（或兼容字段）
- `NEXT_PUBLIC_CORESPACE_CHAIN_ID=1`

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

## 5.2 用例 B：前端新建合同意向（eSpace）

目标：验证用户可在前端创建 `intent`。

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

| 项目 | 结果 | 关键证据 |
|---|---|---|
| Core 下单 | 通过/失败 | Core Tx Hash |
| eSpace 映射 | 通过/失败 | Adapter Tx Hash |
| 新建 intent | 通过/失败 | intentId |
| 入金 | 通过/失败 | Approve/Deposit Tx |
| 双签放款 | 通过/失败 | Release Tx + releaseCount |
| 到期退款（可选） | 通过/失败 | Refund Tx |

建议同时记录：

- `coreOrderId`
- `escrowId`
- `intentId`
- Core 与 eSpace 浏览器链接

---

## 7. 常见问题与处理

- 钱包网络不一致  
  - 现象：按钮不可点或交易失败  
  - 处理：MetaMask 切 71，Fluent 切 1；确认当前操作链与页面提示一致。

- 角色地址不一致  
  - 现象：提示“当前钱包必须是合同用户/商家”  
  - 处理：切换到对应角色账号再操作。

- relayer 无映射日志  
  - 现象：`demo:cross-space` 超时等待 `CoreOrderMapped`  
  - 处理：检查 relayer 是否在运行、Adapter 地址与私钥是否匹配、RPC 是否可用。

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

1. Relayer 在 `createEscrowFromCore` 成功后，读取 `CoreOrderMapped` 事件获得 `escrowId`；
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

