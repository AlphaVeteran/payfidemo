# Web3 本地开发测试方案

> 适用环境：Mac 开发 + Anvil 本地链 + Rabby 钱包 + 多目标链（Base、Hashkey Chain、Conflux）

---

## 一、Nonce 不匹配问题的根源与应对

### 问题根源

Rabby 使用"智能推断"模式管理 nonce，会自行追踪链上 pending nonce，而非完全信任本地 RPC 返回值。在 anvil 下容易出现以下情况：

- 手动出块（`evm_mine`）导致 Rabby 缓存与链状态脱节
- 重启 anvil（状态归零）后，Rabby 仍保留旧 nonce
- 多链切换时，同地址不同链的 nonce 管理出现混淆

### 应对规范

**① 固定 Anvil 状态**

```bash
anvil --chain-id 31337 --state ./anvil-state.json
```

每次使用同一 state 文件启动，开新项目时删除 state 文件并在 Rabby 手动 Reset Account。

**② 出现 nonce 卡住时**

Rabby → Settings → Reset Account（针对当前网络）  
养成习惯：**重启 anvil 后，先 reset，再操作。**

**③ 使用 `--no-mining` 手动出块**

```bash
anvil --no-mining
```

配合 `evm_mine` 或 `hardhat_mine`，减少 Rabby 对 pending 状态的误判。

**④ 本地模拟时使用真实 chain-id**

```bash
# 模拟 Base 本地环境
anvil --chain-id 8453 --fork-url https://mainnet.base.org

# 常用链 ID 参考
# Base:           8453
# Hashkey Chain:  177
# Conflux eSpace: 1030
```

Rabby 会将其识别为对应链，nonce 管理更准确，与测试网/主网行为一致。

**⑤ 脚本层显式管理 nonce（最根本的解法）**

```typescript
// viem 示例
const nonce = await client.getTransactionCount({ address: account.address })
await walletClient.sendTransaction({ ..., nonce })
```

将 nonce 控制权从钱包收回脚本层，钱包只做签名，不做推断。

---

## 二、多角色并发测试方案

### 层一：业务逻辑测试——脚本驱动多账户（主力）

不依赖多个浏览器钱包，直接用 anvil 预置的 10 个账户在脚本层完成多角色流程测试。

```typescript
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const deployer = privateKeyToAccount(ANVIL_PRIVATE_KEYS[0])
const userA    = privateKeyToAccount(ANVIL_PRIVATE_KEYS[1])
const userB    = privateKeyToAccount(ANVIL_PRIVATE_KEYS[2])

// 各自独立 client，nonce 互不干扰
const deployerClient = createWalletClient({ account: deployer, transport: http('http://127.0.0.1:8545') })
const userAClient    = createWalletClient({ account: userA,    transport: http('http://127.0.0.1:8545') })
const userBClient    = createWalletClient({ account: userB,    transport: http('http://127.0.0.1:8545') })
```

优点：多角色并发，无需切换钱包，无 nonce 冲突，可脚本化重复执行。

---

### 层二：UI 交互测试——Chrome 多 Profile + Rabby

测试连接流程和签名 UX 时，使用 Chrome 多 Profile 隔离各角色钱包状态。

```
Chrome Profile 1  →  Rabby（Deployer 账户）
Chrome Profile 2  →  Rabby（User A 账户）
Chrome Profile 3  →  Rabby（User B 账户）
```

**操作要点：**

- 每个 Profile 的扩展、Cookie、钱包状态完全隔离
- Mac 上 `Cmd+Tab` 在三个窗口间切换，每窗口固定一个角色
- 不在钱包内切换账户——这是最容易引发 nonce 问题的操作

> 不推荐 Firefox Multi-Account Containers：扩展隔离不如 Chrome Profile 彻底，Rabby 状态有时会串。

---

### 层三：手机用户体验模拟

#### 方案 A：Chrome DevTools 设备模拟（日常开发，够用 80% 场景）

DevTools → Toggle Device Toolbar → 选 iPhone 机型  
配合 WalletConnect 测试移动端连接流程，无需真机。

#### 方案 B：真机 + 局域网（最真实，上线前验收）

```bash
# Anvil 监听局域网
anvil --host 0.0.0.0 --chain-id 8453

# 或 Hardhat
npx hardhat node --hostname 0.0.0.0
```

手机与 Mac 连同一 WiFi，RPC 地址填 `http://[Mac局域网IP]:8545`

**手机钱包推荐：**

| 场景 | 推荐钱包 | 原因 |
|------|----------|------|
| 普通用户模拟 | MetaMask Mobile | 用户基数最大，行为最有代表性 |
| Hashkey / Conflux 用户 | Rabby Mobile | 对小链支持更好 |
| WalletConnect 流程 | imToken / TokenPocket | 中国用户真实分布 |

#### 方案 C：iOS Simulator（Mac 原生，无需真机）

使用 Xcode 自带 iOS Simulator，通过 Apple Configurator 侧载 MetaMask Mobile，网络直接走 Mac localhost，可完整模拟手机钱包操作。

---

## 三、推荐的完整配置总览

```
Mac 开发环境
│
├── 【业务逻辑层】脚本（viem / ethers）
│     └── 多账户并发，anvil 预置私钥，显式 nonce 管理
│
├── 【UI 交互层】Chrome 多 Profile
│     ├── Profile 1  →  Rabby（Deployer）
│     ├── Profile 2  →  Rabby（User A）
│     └── Profile 3  →  Rabby（User B）
│
└── 【手机模拟层】
      ├── DevTools 设备模拟（日常）
      ├── iOS Simulator + MetaMask（中期验证）
      └── 真机局域网连接（上线前验收）
```

---

## 四、核心原则

- **业务逻辑测试在脚本层**，不依赖钱包 UI
- **UX 流程测试在浏览器多 Profile**，角色固定不切换
- **手机体验在真机验收**，不以 DevTools 替代
- **不在钱包内切换账户模拟多用户**——这是效率最低且最容易出 nonce 问题的方式
- **本地/测试网/主网使用相同工作流**，chain-id 对齐，行为一致

---

## 五、10 分钟验收清单（只开后端 + 三个 Chrome Profile）

### 0) 启动（1 分钟）

```bash
./scripts/reset-local-dev.sh
./scripts/open-role-profiles.sh http://127.0.0.1:8787/
curl -sS http://127.0.0.1:8787/health
```

预期：`ok: true`，且 `chainId` 与本地配置一致（如 31338）。

### 1) 三角色就位（2 分钟）

- `deployer` 窗口导入 `DEPLOYER_PRIVATE_KEY`（或 `SUBMITTER_PRIVATE_KEY`）
- `user` 窗口导入 `USER_PRIVATE_KEY`
- `merchant` 窗口导入 `MERCHANT_PRIVATE_KEY`
- 三窗口都切到同一 Anvil 网络（例如 `Local Anvil(31338)`）

地址核对命令：

```bash
npm run local-flow:accounts
```

确保三窗口 Rabby 当前地址与终端输出一致，不一致就只重置该 Profile。

### 2) 跑主流程（3 分钟）

```bash
npm run local-flow:create
# 记录返回的 intentId
npm run local-flow:fund -- --intent <INTENT_ID>
npm run local-flow:release -- --intent <INTENT_ID>
# 可选：自动释放到结清
npm run local-flow:release-until-settled -- --intent <INTENT_ID>
```

### 3) UX 异常路径（3 分钟）

- **拒签测试**：在对应 Profile 的 Rabby 点 Reject，确认脚本/页面提示清晰
- **错链测试**：切到非 Anvil 网络后再操作，确认出现 chain mismatch 提示
- **角色错配测试**：在 user/merchant 窗口交叉执行一次，确认地址不匹配提示
- **重复释放测试**：已结算后再执行 release，确认是友好跳过而非崩溃

### 4) 通过标准（1 分钟）

- 三个 Profile 全程不切账号，主流程可完成
- 最终状态可到 `settled`
- 异常路径都有可理解提示（拒签/错链/错角色）
- 无 nonce 卡死；若偶发，仅重置对应 Profile

---

## 六、10 分钟验收清单（前后端都开 + 三个 Chrome Profile）

### 0) 启动（1 分钟）

```bash
./scripts/reset-local-dev.sh
npm run dev:frontend
./scripts/open-role-profiles.sh http://localhost:3000/
```

预期：3000 页面可访问，8787 健康检查正常。

### 1) 三角色就位（2 分钟）

- `deployer` 窗口导入 `DEPLOYER_PRIVATE_KEY`（或 `SUBMITTER_PRIVATE_KEY`）
- `user` 窗口导入 `USER_PRIVATE_KEY`
- `merchant` 窗口导入 `MERCHANT_PRIVATE_KEY`
- 三窗口都切到同一 Anvil 网络（例如 `Local Anvil(31338)`）

地址核对命令：

```bash
npm run local-flow:accounts
```

### 2) 连接与签名 UX 主路径（4 分钟）

- 在 `user` 窗口访问 `/user`，点击连接钱包，确认地址显示为 user
- 创建 intent（或粘贴已有 intentId）
- 在 `user` 窗口执行授权 + 入金，观察 Rabby 交易确认弹窗流程
- 在 `user` 窗口执行用户签名，在 `merchant` 窗口执行商家签名
- 提交释放，确认状态从 `active`/`partially_settled` 继续推进

### 3) 脚本补充回归（2 分钟）

```bash
# 若需要快速结清
npm run local-flow:release-until-settled -- --intent <INTENT_ID>
```

并在 `merchant` 视角页面确认状态、历史事件与金额变化。

### 4) 异常路径（1 分钟）

- 错链时点击操作：应出现链不匹配提示
- 在错误角色窗口签名：应出现地址不匹配提示
- 拒签一次：前端提示应可读且可继续重试

### 5) 通过标准

- 三窗口固定角色，不在同窗口切账号
- 连接、交易签名、EIP-712 签名流程可稳定完成
- 结算状态与事件历史可正确反映
- 异常路径提示明确且可恢复
