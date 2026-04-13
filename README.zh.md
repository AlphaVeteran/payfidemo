# PayFi Demo

[English](README.md) | 中文

一个面向托管支付与里程碑放款的端到端 PayFi 演示项目。

## 项目简介

**PayFi Demo** 是一个面向支付金融（PayFi）场景的端到端演示项目，展示了从支付发起到链上资金托管与分期放款的完整流程。  
项目核心能力包括：代币授权与托管、双签分期放款、到期自动退回余款，以及网关/回调验证等关键机制。  
它适合用于黑客松演示、方案验证（PoC）和 PayFi 产品原型开发。

## 总览

PayFi Demo 展示了完整的支付金融流程：

- 用户授权代币并将资金存入托管。
- 商户与平台双签后按里程碑放款。
- 到期后自动退回剩余资金。
- 通过网关/回调校验保障支付一致性。

## 核心能力

- 基于托管账户的链上结算流程。
- 双签里程碑放款机制。
- 到期自动退回余款。
- HashKey Gateway 收银台 + HSP/网关双源验证（本地可验证）。

## 演示

- 演示视频: [https://youtu.be/n32dgEcimV8](https://youtu.be/n32dgEcimV8)
- 在线演示: [https://payfidemo-frontend-hashkey-qa.up.railway.app/](https://payfidemo-frontend-hashkey-qa.up.railway.app)

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