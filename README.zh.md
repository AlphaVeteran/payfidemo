# PayFi 跨境电商托管支付演示

[English](README.md) | 中文

一个面向跨境电商场景的端到端 PayFi 演示项目，聚焦托管结算与里程碑放款。

## 项目简介

**PayFi 跨境电商托管支付演示** 是一个端到端项目，模拟跨境电商中的支付流程：买家创建支付意向、链上托管入金、按里程碑放款，以及未满足条件时的退款兜底。  
项目核心能力包括：代币授权与托管入金、平台治理的里程碑放款、到期自动退回余款，以及网关/回调验证等关键机制。  
它适合用于黑客松演示、方案验证（PoC）和可编程跨境结算产品的快速原型开发。

## 总览

该演示对应一个跨境电商订单生命周期：

- 买家授权代币并将资金存入托管。
- 卖家按履约里程碑获得分阶段放款。
- 平台策略控制放款与退款执行。
- 到期后自动退回剩余资金。
- 通过网关/回调校验保障支付一致性。

### 典型业务场景（港深跨境）

以“香港进口商向深圳出口商采购货物”为例：

- 买家先将 `1000 USDC` 存入托管合约，避免卖家“先发货无保障”。
- 卖家按批次交货，买家逐批验收，达成条件后触发里程碑放款。
- 每期放款都可追溯签署与交易状态，减少对线下对账和中介背书的依赖。
- 到期未释放资金自动退回，避免长期资金占用与纠纷拉扯。

## 核心能力

- 面向跨境订单的链上托管结算流程。
- 基于里程碑的分阶段放款机制。
- 平台治理的放款与退款控制。
- 到期自动退回余款。
- HashKey Gateway 收银台 + HSP/网关双源验证（本地可验证）。

## Conflux Hackfest 叙事

本项目聚焦跨境电商中的信任缺口：

- 买家希望在确认履约前不全额放款。
- 卖家希望在达成里程碑后获得确定性回款。
- 平台需要透明、可审计的结算与风控策略。

通过“托管入金 -> 分批验收 -> 双方确认放款 -> 到期自动退款”的组合，本演示把传统依赖信用背书的流程，改造成可执行、可验证、可审计的链上规则。
这使其适用于跨境电商中“履约不确定、回款周期长、对账成本高”的高频场景（基于 EVM 兼容基础设施）。

### Hackfest 提交文档

- 完整提交草案: [docs/hackfest-2026-submission.md](docs/hackfest-2026-submission.md)

## 演示

- 演示视频: [https://youtu.be/n32dgEcimV8](https://youtu.be/n32dgEcimV8)
- 在线演示（HashKey Chain Testnet, ChainID: 133）: [https://payfidemo-frontend-hashkey-qa.up.railway.app/](https://payfidemo-frontend-hashkey-qa.up.railway.app)
- 在线演示（Base Sepolia, ChainID: 84532）: [https://payfidemo-frontend-base-sepolia.up.railway.app/](https://payfidemo-frontend-base-sepolia.up.railway.app/)

### Railway 公网环境现状（HashKey Testnet）

- Railway 公网访问 `payfidemo` 时，可正常演示链上流程：授权代币 + 存入托管、双签分期放款、到期余款自动退回。
- HashKey Gateway 收银台能力在 Railway 公网环境会被 Cloudflare/Bot 防护拦截（`payment_url` 可能为空）。
- HashKey Gateway 收银台 + HSP/网关双源验证 已在本地环境测试通过（可参考演示视频: [https://youtu.be/n32dgEcimV8](https://youtu.be/n32dgEcimV8)）。

## 快速开始

- 查看系统栈架构: [docs/system-architecture-stack.md](docs/system-architecture-stack.md)
- 查看托管架构说明: [docs/payfi-escrow-architecture.md](docs/payfi-escrow-architecture.md)
- 查看动态架构总览: [docs/payfidemo_architecture_overview_en.html](docs/payfidemo_architecture_overview_en.html)

## 许可证

MIT