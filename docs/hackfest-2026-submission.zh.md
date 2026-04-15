# Conflux 跨境电商 PayFi 托管支付

面向跨境电商的里程碑托管支付基础设施。

许可证：MIT  
Conflux 黑客松提交材料

## 项目概览

PayFi Cross-border Escrow 提供了一个可落地的国际贸易支付流程：
买家将资金锁定在托管账户，卖家按履约里程碑收款，未达条件的订单可按策略退款。

本项目基于 `payfidemo` 代码库构建，并针对 Global Hackfest 2026 调整为跨境电商叙事。

### 示例场景（路演最新版）

以“**上海买家**向**香港卖家**进口货物”为例，订单总额 `1000 USDC`：

1. 买家先将全额资金托管入链上合约。
2. 卖家分 5 批交付，每批验收后释放 `200 USDC`。
3. 每次放款均由规则驱动并可链上校验，减少人工对账与争议成本。
4. 到期未释放余额自动退回买家，资金不被长期占用。

## 黑客松信息

- **活动**：Global Hackfest 2026
- **方向**：开放创新（DeFi / Payments）
- **团队**：[填写团队名称]
- **提交日期**：2026-04-20

## 团队

| 姓名 | 角色 | GitHub | Discord |
| --- | --- | --- | --- |
| [Your Name] | Builder / Full-stack | [@your-github](https://github.com/your-github) | [your-discord] |

## 问题陈述

跨境电商在信任与结算层面存在明显缺口：

- 买家担心先付款后不发货。
- 卖家担心履约后回款延迟或被拒付。
- 平台需要透明、可审计的放款规则。
- 传统信用证和人工审核流程长、费用高，对中小贸易主体不友好。

传统支付系统无法原生支持“可编程、可审计”的里程碑结算。

## 解决方案

我们实现了里程碑托管流程：

1. 买家创建支付意向并使用 USDC 入金托管。
2. 卖家按阶段完成履约。
3. 平台与签名策略触发里程碑放款。
4. 若到期仍未满足条件，剩余资金可退款。

该方案提升了交易信任，降低了结算歧义，并使支付状态流转可验证。
相较传统“先打款或走信用证”的路径，本方案更适合高频、小额、跨境数字化履约场景。

## Go-to-Market 计划

### 目标用户

- 跨境中小商家（SMB）
- 自由职业者与出口服务提供方
- 需要条件式分账能力的平台型商户

### 推广路径

- 提供可直接体验的在线 Demo 用于快速上手
- 采用 API-first 方式嵌入商户结算流程
- 与 Conflux 生态中的商户与开发者社区协作推广

### 关键指标

- 创建的支付意向数量
- 托管资金规模
- 结算完成率
- 入金到放款的平均耗时

### 生态契合

项目为可编程商业结算提供了 Conflux 可用的支付中间件范式。
在 Conflux 生态中，它可以作为商户、平台与服务商之间的标准化“条件支付层”。

## Conflux 集成

- **eSpace**：托管合约生命周期（入金、放款、退款）运行在 Conflux eSpace 测试网。
- **EVM 兼容**：使用 Solidity 合约与标准钱包工具链。
- **链上可验证**：关键支付动作均可通过交易哈希在浏览器追踪。

当前 MVP 聚焦 eSpace 路径，以满足黑客松交付效率与完整性。

### Cross-Space PoC（扩展演示计划）

为体现 Conflux 双空间能力，我们将方案拆成两段实现：

- **第一段（路演保证交付）**：事件映射闭环  
  `Core 下单保证金事件 -> eSpace 自动创建 Escrow -> 手动/模拟签收 -> 自动放款`
- **第二段（赛后升级）**：真实资金跨空间搬运  
  将“事件映射 + relayer 垫资”升级为“跨空间到账证明 + 到账后入托管 + 失败补偿”。

最小改动原则：尽量不改 `PayFiEscrow.sol` 主状态机，通过新增适配层实现跨空间能力。

#### 第二段升级要点与难点（文档口径）

- 升级要点：资产跨空间通道、`coreOrderId` 与 `transferId/messageId` 绑定、到账证明校验后再 `registerDeposit`、补偿与重试机制、状态机扩展（`bridging/bridged/failed`）。
- 主要难点：跨空间异步导致的一致性治理、非原子流程的幂等与防重放、确认深度与时延平衡、双空间可观测与审计链路。
- 路演边界：本次仅承诺第一段闭环验收；第二段不作为路演阻塞项。

- **角色与职责**
  - `buyer`：在 Core 下单并支付保证金，在 eSpace 侧签收确认
  - `seller`：履约并接收放款
  - `projectAdmin`：部署、参数配置与白名单管理
  - `relayer`：监听 Core 事件并在 eSpace 发起创建 escrow 交易
  - `arbiter`（可选）：争议裁决

- **币种策略**
  - 主流程：`CFX`（快速跑通）
  - 稳定币分支：`eSpace USDT`（跨境电商结算语义更清晰）
  - 说明：Core USDT 与 eSpace USDT 属于不同执行空间资产，需通过跨空间映射流程联动

- **技术方案（最小落地）**
  - 新增 Core 合约 `CoreOrderVault`：收保证金并发出 `OrderDeposited`
  - 新增 eSpace 合约 `ESpaceEscrowAdapter`：把 Core 事件映射为 escrow 创建/放款动作
  - 新增 `relayer` 服务：监听事件、执行交易、维护 `coreOrderId -> escrowId` 映射
  - 防重放：同一 `orderId` 仅允许处理一次

- **本地测试与钱包准备**
  - 钱包：`MetaMask`（eSpace）+ `Fluent`（Core Space）
  - 账户：`buyer`、`seller`、`projectAdmin`、`relayer`（建议再加 `arbiter`）
  - Faucet：
    - Core：<https://faucet.confluxnetwork.org/>
    - eSpace：<https://efaucet.confluxnetwork.org/>

- **测试用例（必须通过）**
  - Happy path：Core 下单成功 -> eSpace 创建 escrow 成功 -> 签收 -> 自动放款
  - 安全用例：事件重放被拒绝、非白名单调用被拒绝、参数不一致被拒绝

- **时间估算**
  - 合约与部署脚本：1.0 - 1.5 天
  - Relayer 开发：1.0 天
  - 前端最小接入：0.5 - 1.0 天
  - 测试与彩排：1.0 - 1.5 天
  - 合计：约 4 - 5 天（压缩模式 2.5 - 3 天）

## 功能特性

### 核心功能

- 基于托管账户的支付意向资金锁定
- 基于里程碑的分阶段放款
- 到期或未达条件场景的退款兜底
- 前后端联动的支付生命周期状态可视化

### 规划路线图

- 争议仲裁模块
- 基于物流事件的里程碑自动触发
- 商户看板与结算分析能力

## 技术栈

- **前端**：Next.js
- **后端**：Node.js REST API
- **数据库**：PostgreSQL（Neon）
- **智能合约**：Solidity
- **网络**：Conflux eSpace testnet

## 系统架构

前端（下单与状态追踪）  
<-> 后端 API（意向生命周期、校验与放款编排）  
<-> Conflux eSpace 托管合约（入金 / 放款 / 退款）

## 安装与运行

- 主仓库地址：[https://github.com/your-org/payfidemo](https://github.com/your-org/payfidemo)
- 按根目录 `README.md` 完成环境配置与服务启动。
- 使用 Conflux/HashKey 测试网环境配置跑通完整链路。

## 演示信息

- **在线演示**：[填写部署链接]
- **Demo 视频（3-5 分钟）**：[填写 YouTube 链接]
- **参赛者自我介绍视频（30-60 秒）**：[填写链接]

## 智能合约

- **托管合约（Conflux eSpace testnet）**：`0x...`
- **区块浏览器**：[https://evmtestnet.confluxscan.io/address/0x...](https://evmtestnet.confluxscan.io/address/0x...)

## 提交链接

- **主仓库**：[https://github.com/your-org/payfidemo](https://github.com/your-org/payfidemo)
- **Hackathon 仓库项目条目**：[填写 PR 链接]
- **Open Dev Data PR**：[填写 PR 链接]
- **Submission Issue**：[填写 issue 链接]
- **Tweet / 社媒帖子**：[填写链接]

## 已知限制

- MVP 阶段对争议处理做了简化。
- 上线前仍需进一步安全加固与审计。

## 许可证

MIT
