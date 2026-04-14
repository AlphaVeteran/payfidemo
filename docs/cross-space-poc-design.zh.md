# Cross-Space PoC 设计文档（Core -> eSpace Escrow）

## 1. 目标与范围

本 PoC 目标是演示一条可落地的 Conflux 双空间支付链路：

1. Core Space 下单并支付保证金（触发事件）
2. eSpace 自动创建 Escrow（由 relayer 执行）
3. 手动/模拟签收
4. 自动放款给卖家

默认约束：**尽量不改现有 `PayFiEscrow.sol` 主逻辑**，以减少回归风险并保证黑客松交付节奏。

---

## 2. 角色及职责

### 2.1 最小必需角色（4 个）

- `buyer`（买家）
  - 在 Core Space 下单并支付保证金
  - 在 eSpace 侧触发签收确认（手动/模拟）
- `seller`（卖家）
  - 接单、履约（发货状态由系统或手动模拟）
  - 收取放款资金
- `projectAdmin`（项目方/管理员）
  - 合约部署、参数配置、白名单管理
  - 紧急暂停与异常处理
- `relayer`（跨空间执行账户）
  - 监听 Core 事件
  - 在 eSpace 发起创建 escrow 的链上交易
  - 维护 `coreOrderId -> escrowId` 映射

### 2.2 推荐补充角色（可选）

- `arbiter`（仲裁员）
  - 争议订单裁决（退款/强制放款）
- `sponsor`（Gas 代付账户）
  - 负责用户免 gas 场景的费用承担

---

## 3. 币种选择策略

### 3.1 推荐方案（比赛交付优先）

- 主流程：`CFX`（快速跑通、依赖少）
- 稳定币分支：`eSpace USDT`（跨境电商叙事最直观）

### 3.2 为什么优先 eSpace USDT

- 现有 `PayFiEscrow.sol` 部署在 eSpace，接入成本最低
- 对评审和业务方来说，USDT 结算语义明确
- 能保留后续扩展空间（USDC、多币白名单）

### 3.3 Core USDT 与 eSpace USDT 说明

- 它们位于不同执行空间，不可直接当同一余额使用
- 若要跨空间联动，需要事件驱动 + 映射/桥接流程

---

## 4. 可落地方案（最小改动版）

## 4.1 合约与服务改动

### A. 新增 Core 合约：`CoreOrderVault`

核心职责：

- `placeOrderDeposit(orderId, buyer, seller, token, amount)`
  - 收取保证金
  - 记录订单状态
  - 发出 `OrderDeposited` 事件

建议事件字段：

- `orderId`
- `buyer`
- `seller`
- `token`
- `amount`
- `timestamp`

### B. 新增 eSpace 适配器：`ESpaceEscrowAdapter`

核心职责：

- `createEscrowFromCore(...)`：将 Core 事件映射为 eSpace escrow 创建动作
- `confirmDeliveryAndRelease(...)`：签收后触发对 `PayFiEscrow` 的放款流程
- 防重放机制：`processedOrderId[orderId] = true`

### C. 新增 Relayer 服务（Node.js 脚本即可）

核心职责：

- 监听 Core 的 `OrderDeposited`
- 校验事件来源与参数白名单
- 调用 eSpace `createEscrowFromCore`
- 写入映射：`coreOrderId -> escrowId`（数据库或本地 json）

## 4.2 现有主合约改动原则

- `PayFiEscrow.sol` 主状态机不改或仅做最小接口暴露
- 通过 Adapter 封装跨空间行为，不把跨空间复杂性塞进主合约

---

## 5. 交易流（目标链路）

1. `buyer` 调用 Core `placeOrderDeposit`
2. Core 链上产生日志 `OrderDeposited`
3. `relayer` 监听到事件后调用 eSpace `createEscrowFromCore`
4. eSpace 创建 escrow 成功并记录映射
5. `buyer` 手动/模拟签收（前端按钮或脚本）
6. Adapter/主合约触发 `release`
7. 资金自动放款到 `seller`

---

## 6. 本地测试环境准备

## 6.1 基础环境

- Node.js 18+
- npm / pnpm（与仓库现状一致）
- Hardhat 或 Foundry（按现有仓库工具链）
- 可访问 Core/eSpace 测试网 RPC

## 6.2 钱包准备（建议新浏览器 Profile）

- 新建独立浏览器 Profile（Hackathon 专用）
- 安装 `MetaMask`（主要用于 eSpace）
- 安装 `Fluent`（主要用于 Core Space）
- 仅使用测试私钥，严禁导入主资产钱包

## 6.3 账户准备（建议 5-6 个）

- `buyer`
- `seller`
- `projectAdmin`
- `relayer`
- `arbiter`（可选）
- `sponsor`（可选）

说明：`relayer` 建议独立 EOA，避免与 admin 共用私钥。

## 6.4 Faucet 与 Gas

- Core 测试网领币：<https://faucet.confluxnetwork.org/>
- eSpace 测试网领币：<https://efaucet.confluxnetwork.org/>

部署两个空间合约时，对应发送交易账户都需要有足够 CFX 支付 gas。

---

## 7. 测试步骤（可直接执行）

## 7.1 Happy Path（必须通过）

1. Core 下单并支付保证金成功
2. Relayer 成功在 eSpace 自动创建 escrow
3. 手动/模拟签收成功
4. 自动放款成功，`seller` 余额增加
5. 两空间映射一致（`coreOrderId -> escrowId`）

## 7.2 异常与安全（建议至少 4 条）

- 重放同一 Core 事件，应被防重放拒绝
- 非白名单地址调用 Adapter，应回滚
- 金额/订单参数不一致，应拒绝执行
- 超时未履约，走退款路径成功

## 7.3 演示彩排清单

- 准备 3 个交易哈希：Core 下单、eSpace 创建、eSpace 放款
- 准备 1 个失败样例：重放攻击被拒绝
- 准备 1 张状态流转图用于答辩

---

## 8. 时间估算（1 人）

- 合约新增与部署脚本：`1.0 - 1.5 天`
- Relayer 开发与映射存储：`1.0 天`
- 前端最小展示接入：`0.5 - 1.0 天`
- 测试与问题修复：`1.0 天`
- 文档与录屏彩排：`0.5 天`

总计：**4 - 5 天（稳妥）**  
压缩模式（仅 happy path）：**2.5 - 3 天**

---

## 9. MVP 交付定义（DoD）

满足以下条件即视为 PoC 可提交：

- 可完成 Core 下单 -> eSpace 创建 escrow -> 签收 -> 放款全链路
- 有防重放与调用权限控制
- 有最小测试报告（happy path + 至少 2 条异常）
- 有 2-3 分钟演示视频与关键 tx 哈希

