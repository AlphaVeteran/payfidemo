# payfidemo 3-Week Daily Plan (Checklist)

目标：在 21 天内完成可提交的 PayFi demo（Base Sepolia + Escrow + Mock HSP + 可选 x402），并保持稳定内容输出。

## 使用方式

- 每天只允许 1 个「核心交付」。
- 每天至少 1.5h 开源学习（只看当天相关部分）。
- 每天至少记录 1 条「决策日志」用于长文素材。

---

## Week 1 - Foundation (Contract + Architecture + Minimal Backend)

### Day 1
- [ ] 冻结范围（PayFi 主叙事、Base Sepolia、Mock HSP、x402 可选）
- [ ] 初始化目录：`contracts/` `api/` `web/` `docs/`
- [ ] 建立 `.env.example`（`CHAIN_ID=84532`、`RPC_URL`、`ESCROW_ADDRESS` 占位）
- [ ] 开源学习（1.5-2h）：`coinbase/x402` 仓库结构与 client-server 模型
- [ ] 长文选题（3）：
  - [ ] 为什么先做 Mock HSP，而不是等 SDK 完整
  - [ ] PayFi 不只是支付按钮
  - [ ] 黑客松 MVP 的边界如何定

### Day 2
- [ ] 设计 Escrow 结构（多 `escrowId`）
- [ ] 完成 `createAndDeposit` 初版
- [ ] 开源学习：`RequestNetwork/requestNetwork` 的 payment request 概念
- [ ] 长文选题（3）：
  - [ ] intentId 和 escrowId 为什么要分离
  - [ ] 预付费模式的系统性风险
  - [ ] 托管资金池的最小可信模型

### Day 3
- [ ] 完成 `releaseBySignatures`（双签 + nonce）
- [ ] 开源学习：`Uniswap/permit2` 的签名与 nonce 设计
- [ ] 长文选题（3）：
  - [ ] EIP-712 在消费场景的价值
  - [ ] 双签流程如何防重放
  - [ ] 签名域不一致导致的真实故障

### Day 4
- [ ] 完成 `refund` 与到期逻辑
- [ ] 定义核心事件（Created/Released/Refunded）
- [ ] 开源学习：`sablier`/`superfluid` 的分期结算抽象
- [ ] 长文选题（3）：
  - [ ] 到期自动退款为何关键
  - [ ] 时间条件如何进入资金合约
  - [ ] 按课次结算与流支付的区别

### Day 5
- [ ] 编写单元测试（happy path + revert path）
- [ ] 覆盖：重复提交、超额释放、过期后释放失败
- [ ] 开源学习：`BTCPayServer` 的状态机与投递思路
- [ ] 长文选题（3）：
  - [ ] 支付系统先测什么
  - [ ] 失败路径比成功路径更重要
  - [ ] 可测试性如何反向影响架构

### Day 6
- [ ] 部署 Escrow 到 Base Sepolia
- [ ] 记录合约地址、浏览器链接、调用示例
- [ ] 开源学习：Base 文档（RPC、浏览器、faucet）
- [ ] 长文选题（3）：
  - [ ] 为什么默认链选 Base Sepolia
  - [ ] 测试网部署踩坑记录
  - [ ] 「可验证地址」如何提升信任

### Day 7
- [ ] Week1 修复与文档日（不加新功能）
- [ ] 更新架构图与流程图
- [ ] 开源学习复盘：输出 1 份「参考-映射」表
- [ ] 长文选题（3）：
  - [ ] 我删掉了哪些需求，为什么
  - [ ] 开源阅读如何改变了设计
  - [ ] 从概念到可部署的一周

---

## Week 2 - Core System (Intent API + Mock HSP + Webhook)

### Day 8
- [ ] 实现 `POST /intents`
- [ ] 实现 `GET /intents/:id`
- [ ] 建表：`intents`
- [ ] 开源学习：`RequestNetwork/request-apps` 应用层组织
- [ ] 长文选题（3）：
  - [ ] 为什么先完成意图层
  - [ ] 状态机如何避免“业务漂移”
  - [ ] API 语义与领域建模

### Day 9
- [ ] 实现 funding 确认（`txHash -> receipt -> escrowId`）
- [ ] 更新状态 `awaiting_funding -> active`
- [ ] 开源学习：事件驱动同步与轻量索引
- [ ] 长文选题（3）：
  - [ ] 链上真相与链下状态的冲突
  - [ ] 何时才算「资金到位」
  - [ ] 回执驱动业务状态的实践

### Day 10
- [ ] 实现 `POST /intents/:id/release/prepare`
- [ ] 输出 EIP-712 typed data（含 agreement anchor）
- [ ] 开源学习：签名验证最佳实践
- [ ] 长文选题（3）：
  - [ ] prepare/submit 二阶段的意义
  - [ ] agreementHash 如何成为合同锚点
  - [ ] chainId/domain 的常见坑

### Day 11
- [ ] 实现 `POST /intents/:id/release/submit`
- [ ] 成功后更新 `releasedTotal/releaseCount`
- [ ] 开源学习：事件触发业务更新模式
- [ ] 长文选题（3）：
  - [ ] 一节课一笔结算的工程化
  - [ ] 后端应做编排，不碰托管资金
  - [ ] 如何确保不会重复释放

### Day 12
- [ ] 实现 `MockSettlementAdapter`（`SettlementPort`）
- [ ] 建 `settlement_outbox`（日志或表）
- [ ] 开源学习：`x402` 402 challenge 与重试流程
- [ ] 长文选题（3）：
  - [ ] Mock 不是偷懒，是交付策略
  - [ ] 消息层与资金层为何必须解耦
  - [ ] HSP 可插拔对项目节奏的价值

### Day 13
- [ ] 实现 webhook（签名、timestamp、eventId）
- [ ] 支持基础重试 + 幂等去重
- [ ] 建 `webhook_deliveries`
- [ ] 开源学习：`BTCPayServer` webhook 投递策略
- [ ] 长文选题（3）：
  - [ ] Webhook 为什么是商户生命线
  - [ ] 幂等键设计实战
  - [ ] 时钟偏差如何引发误判

### Day 14
- [ ] Week2 全链路联调（创建 -> 充值 -> 释放 -> 回执）
- [ ] 补失败场景与恢复策略
- [ ] 开源学习：回看 x402 是否纳入 Week3
- [ ] 长文选题（3）：
  - [ ] 本周最耗时环节复盘
  - [ ] 联调成本为何常被低估
  - [ ] 如何在不确定依赖下推进

---

## Week 3 - Productization (Frontend + Optional x402 + Submission)

### Day 15
- [ ] 前端页：创建意图 + 读取状态
- [ ] 展示 `intentId`、`escrowId`、当前状态
- [ ] 开源学习：`DePay/widgets` 的商户接入体验
- [ ] 长文选题（3）：
  - [ ] 技术能力如何转化为可用产品
  - [ ] 状态可视化就是信任可视化
  - [ ] 为什么用户页面要显示链上事实

### Day 16
- [ ] 前端页：双方确认 + 签名交互
- [ ] 显示 release 历史列表
- [ ] 开源学习：钱包签名 UX 实践
- [ ] 长文选题（3）：
  - [ ] 双签 UX 的摩擦与优化
  - [ ] 失败提示如何影响资金信任
  - [ ] 钱包交互的人性化设计

### Day 17
- [ ] 前端页：到期退款与回执可视化
- [ ] 商户端查看 webhook 投递结果
- [ ] 开源学习：仪表盘信息层次案例
- [ ] 长文选题（3）：
  - [ ] 回执可读性为什么重要
  - [ ] 自动退款如何降低争议
  - [ ] 「看得见的资金流」产品价值

### Day 18
- [ ] 可选接入 x402（保护 1-2 条只读 API）
- [ ] 环境开关：`X402_ENABLED`
- [ ] 开源学习：`x402` 最小可运行样例
- [ ] 长文选题（3）：
  - [ ] x402 主要解决什么问题
  - [ ] 为什么 x402 与 Escrow 解耦更实用
  - [ ] 402 支付挑战如何接入现有 API

### Day 19
- [ ] 端到端回归（happy + failure）
- [ ] 确认演示路径 3-5 分钟可完整跑通
- [ ] 开源学习：测试报告与缺陷分级
- [ ] 长文选题（3）：
  - [ ] 一次可交付验收该看什么
  - [ ] 哪些 bug 必须修、哪些可延后
  - [ ] 演示稳定性优先于功能堆叠

### Day 20
- [ ] 完成 README、架构图、FAQ、部署说明
- [ ] 完成 DoraHacks 提交文案草稿
- [ ] 开源学习：优秀黑客松提交结构
- [ ] 长文选题（3）：
  - [ ] 技术叙事如何让评审一眼看懂
  - [ ] 可验证 demo 的写作框架
  - [ ] 我如何组织提交材料

### Day 21
- [ ] 冻结功能（只修 P0）
- [ ] 录制演示视频并提交
- [ ] 产出最终复盘文档
- [ ] 开源学习：整理本月参考项目笔记
- [ ] 长文选题（3）：
  - [ ] 21 天从 0 到 PayFi demo
  - [ ] 我在这个过程中做过的关键取舍
  - [ ] 下一步：真实 HSP 与合作路线图

---

## Daily Rhythm (Recommended)

- [ ] 开发：5h（当日核心任务）
- [ ] 开源学习：1.5h
- [ ] 文档更新：1h
- [ ] 长文素材沉淀：0.5h

## Weekly Gate

- [ ] Week 1 Gate：合约可部署、可测试
- [ ] Week 2 Gate：Intent + Mock HSP + Webhook 全链路
- [ ] Week 3 Gate：前端可演示、文档齐全、可提交
