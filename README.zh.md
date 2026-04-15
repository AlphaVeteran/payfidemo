# PayFi Cross-border Escrow Demo

[English](README.md) | 中文

一个面向跨境电商场景的端到端 PayFi 演示项目，聚焦 Escrow 托管结算与里程碑放款。

## 项目介绍

**PayFi Cross-border Escrow Demo** 是一个端到端项目，模拟跨境电商支付流程：买家创建支付意向、链上 Escrow 托管入金、按里程碑放款，以及未满足条件时的退款兜底。  
核心能力包括：代币授权与 Escrow 托管入金、平台治理的里程碑放款、到期自动退回余款，以及 Gateway / webhook 验证机制。  
适用于黑客松演示、PoC 验证和可编程跨境结算产品的快速原型开发。

## 概览

该演示对应一个跨境电商订单生命周期：

- 买家授权代币并将资金存入 Escrow 托管。
- 卖家按履约里程碑获得分阶段放款。
- 平台策略控制放款与退款执行。
- 到期后自动退回剩余资金。
- 通过网关 / webhook 校验保障支付一致性。

## 核心能力

- 跨境订单托管与链上结算流程。
- 基于里程碑的分阶段放款机制。
- 平台治理的放款与退款控制。
- 到期自动退回余款。
- HashKey Gateway + HSP / Gateway 双源验证（本地已验证）。

## Conflux Hackfest 2026（建设中...）

### 叙事

**Cross-Space PoC 验证（Core -> eSpace）**

本项目聚焦跨境电商中的信任缺口：

- 买家希望在确认履约前不全额放款。
- 卖家希望在达成里程碑后获得确定性回款。
- 平台需要透明、可审计的结算策略。

通过“托管入金 + 里程碑放款 + 到期退款兜底”的组合，本演示展示了基于 EVM 兼容基础设施的实用 PayFi 跨境结算模式。

### 路线图

路演（Roadshow）叙事：**上海买家**向**香港卖家**进口货物，使用可编程 Escrow 托管降低跨境交易中的信任成本与结算摩擦。

实现分为两阶段：

1. **第一阶段（路演承诺）**：事件映射（Mapping）闭环（`Core 订单事件 -> eSpace escrow 映射 -> 放款/退款流程`）。
2. **第二阶段（路演后升级）**：基于证明一致性的真实跨空间资金搬运。

我们已验证第一阶段从 Core 侧下单事件到 eSpace Escrow 托管执行的端到端流程：

1. 买家在 `CoreOrderVault` 授权并存入订单保证金；
2. Relayer 监听 Core 的 `OrderDeposited` 并调用 eSpace `createEscrowFromCore`；
3. Adapter 在 `PayFiEscrow` 注册 Escrow 托管并产出映射后的 `escrowId`。

> 范围说明：当前 PoC 为保证路演稳定性，优先交付“事件映射（Mapping）业务闭环”；真实资金跨空间搬运为下一里程碑。

**链上证据（eSpace testnet / chainId 71）**

- Conflux Core Space Testnet 使用 `chainId = 1`（不同于 Ethereum mainnet 的 `chainId = 1` 语义）。
- Approve Tx: `0x407e0c9ee6c4a21c3a43e04e93f99993942c5d992970792a87972bfa9ab70dfa`
- Core order deposit Tx: `0x6c3cde5d1adffb3fd983005ff09c0573a436c4f20ee995fa311c274cfa475bf4`
- eSpace mapping Tx: `0x300c7ec833c0633cebdc0642d5f9ea303c0525c57cfd77f7b15e2adb3de9edea`
- coreOrderId: `1776175312179`
- escrowId: `10429080304411244359614541526982370061373641461870929980440368445856475775012`

**已部署合约**

- CoreOrderVault: `0xAe26E03F8C0E7c8B0ACe8dc8B825A498f8925Fdf`
- ESpaceEscrowAdapter: `0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38`
- PayFiEscrow: `0x44898c384Af98dBB3666E0c0dD9dA643547863a6`
- MockERC20（演示资产）: `0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca`

### Hackfest 提交文档

- 完整提交草案: [docs/hackfest-2026-submission.md](docs/hackfest-2026-submission.md)

---

## 演示

- 演示视频（HashKey Chain Horizon Hackathon）: [https://youtu.be/n32dgEcimV8](https://youtu.be/n32dgEcimV8)
- 在线演示（Hashkey Chain Testnet, ChainID: 133）: [https://payfidemo-frontend-hashkey-qa.up.railway.app/](https://payfidemo-frontend-hashkey-qa.up.railway.app)
- 在线演示（Base Sepolia, ChainID: 84532）: [https://payfidemo-frontend-base-sepolia.up.railway.app/](https://payfidemo-frontend-base-sepolia.up.railway.app/)

### Railway 公网环境状态（HashKey Testnet）

- Railway 公网部署可演示核心链上流程：代币授权 + Escrow 托管入金、双签分期放款、到期余款自动退回。
- HashKey Gateway Checkout 能力在 Railway 公网环境可能受 Cloudflare/Bot 防护影响（`payment_url` 可能为空）。
- HashKey Gateway Checkout + HSP / Gateway 双源验证已在本地环境验证通过（见演示录屏）。

## 快速开始

- 查看系统栈架构: [docs/system-architecture-stack.md](docs/system-architecture-stack.md)
- 查看 Escrow 托管架构说明: [docs/payfi-escrow-architecture.md](docs/payfi-escrow-architecture.md)
- 查看动态架构总览: [docs/payfidemo_architecture_overview_en.html](docs/payfidemo_architecture_overview_en.html)

## 许可证

MIT