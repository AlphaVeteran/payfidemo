# PayFiDemo UI 开发任务清单（用户/商家双入口）

## 1. 目标与范围

目标：按 `docs/ui-design-user-merchant-flow.md` 落地一版可演示的双入口 UI（User + Merchant）。

范围：

- 首页角色分流与流程恢复
- 用户工作台核心流程（创建/入金/签名/查看状态/退款）
- 商家控制台核心视图（总览/意图/历史/用户消费）
- 基于现有接口完成首版，不阻塞上线

---

## 2. 里程碑（建议 4 天）

- Day 1：首页双入口 + 路由骨架 + 角色记忆
- Day 2：用户流程页（基于现有 `payfi-demo.tsx` 抽离）
- Day 3：商家控制台（总览+意图+历史）
- Day 4：用户消费统计 + 联调 + 验收修复

---

## 3. 前端任务清单

## 3.1 路由与页面结构（P0）

- [ ] 新增 `/` 首页（角色分流）
- [ ] 新增 `/user` 用户工作台
- [ ] 新增 `/merchant` 商家控制台
- [ ] 新增 `/intent/[intentId]` 统一详情页（支持 `role` 参数）
- [ ] 从现有 `frontend/components/payfi-demo.tsx` 抽离公共逻辑到 hooks

交付标准：

- 首页可进入用户/商家入口
- 输入 `intentId` 可跳转并恢复流程

## 3.2 首页双入口（P0）

- [ ] 角色卡片（我是用户 / 我是商家）
- [ ] 继续上次流程输入框（intentId）
- [ ] 最近记录列表（本地缓存或接口数据）
- [ ] 角色记忆：`localStorage.payfi.role`
- [ ] 最近 intent 记忆：`localStorage.payfi.lastIntentId`

交付标准：

- 刷新后保留角色偏好
- 最近记录点击可直接进入详情

## 3.3 用户工作台（P0）

- [ ] 创建意图表单（基础字段 + 高级字段折叠）
- [ ] 入金动作区（Approve + createAndDeposit）
- [ ] 用户签名区（Sign as user）
- [ ] 状态卡片（status/releaseCount/releasedTotal）
- [ ] 条件退款按钮（到期显示）

交付标准：

- 从创建到 active 可完整跑通
- 状态变化后按钮可用性正确变化

## 3.4 商家控制台（P0/P1）

- [ ] `Dashboard`：KPI 卡片（待支付/托管中/已结算/已退款）
- [ ] `Intents`：表格 + 状态筛选 + 用户搜索
- [ ] `Intent Detail`：基本信息 + 进度 + 商家操作位
- [ ] `History`：事件时间线（来自 outbox）

交付标准：

- 商家可查看用户意图与支付状态
- 商家可查看支付历史事件

## 3.5 用户消费统计（P1）

- [ ] `User Spend` 查询区（用户地址 + 时间范围）
- [ ] 汇总卡（累计消费/已结算/托管中/退款）
- [ ] 明细列表（该用户 intent 维度）

交付标准：

- 输入用户地址后可得到消费汇总与明细

## 3.6 交互与状态统一（P0）

- [ ] 状态文案映射统一（待支付/托管中/部分结算/已结算/已退款）
- [ ] 按钮状态统一（idle/pending_wallet/pending_chain/success/error）
- [ ] 错误提示补全“下一步建议”
- [ ] 顶部统一 `intentId + 状态 + 刷新`

---

## 4. 后端任务清单

## 4.1 首版（不改接口即可）

- [ ] 复用 `GET /intents`、`GET /intents/:id`、`GET /debug/hsp-outbox`
- [ ] 确认字段稳定输出（status/releaseCount/releasedTotal/expiresAt）
- [ ] 校验错误码与错误信息可读性（前端直显）

## 4.2 可选增强（P1，不阻塞）

- [ ] `GET /intents` 支持查询参数过滤：`merchant/status/user/from/to`
- [ ] 新增商家统计接口：`GET /merchants/:merchant/stats`
- [ ] 新增用户消费汇总：`GET /merchants/:merchant/users/:user/spend-summary`

---

## 5. 联调与测试任务

## 5.1 功能联调（P0）

- [ ] 创建 intent -> 入金 -> active
- [ ] 用户签名 -> 商家签名 -> release submit
- [ ] 部分结算多次提交 -> settled
- [ ] 到期后 refund

## 5.2 角色联调（P0）

- [ ] 用户入口可完成支付流程
- [ ] 商家入口可看到同一 intent 的状态变化
- [ ] 用户与商家切换角色后数据一致

## 5.3 异常场景（P1）

- [ ] 钱包地址与角色不匹配提示
- [ ] 签名顺序错误提示（merchant 前置签名）
- [ ] 链上失败、RPC 超时、交易回执失败提示

---

## 6. 组件与文件建议

建议新增：

- [ ] `frontend/app/page.tsx`（首页）
- [ ] `frontend/app/user/page.tsx`
- [ ] `frontend/app/merchant/page.tsx`
- [ ] `frontend/app/intent/[intentId]/page.tsx`
- [ ] `frontend/components/home/role-entry.tsx`
- [ ] `frontend/components/shared/intent-status-header.tsx`
- [ ] `frontend/components/user/intent-wizard.tsx`
- [ ] `frontend/components/merchant/merchant-shell.tsx`
- [ ] `frontend/components/merchant/dashboard-panel.tsx`
- [ ] `frontend/components/merchant/intents-table.tsx`
- [ ] `frontend/components/merchant/history-timeline.tsx`
- [ ] `frontend/components/merchant/user-spend-panel.tsx`

建议抽离 hooks：

- [ ] `frontend/hooks/use-intent-flow.ts`
- [ ] `frontend/hooks/use-merchant-metrics.ts`
- [ ] `frontend/hooks/use-intent-history.ts`

---

## 7. 验收清单（DoD）

- [ ] 新用户 30 秒内找到下一步动作
- [ ] 首页双入口可用，角色切换清晰
- [ ] 支持 `intentId` 恢复
- [ ] 商家可查看：用户意图、支付状态、支付历史、特定用户消费
- [ ] 页面刷新后角色与最近意图可恢复
- [ ] 全流程演示 3-5 分钟可稳定跑通

---

## 8. 排期建议（按优先级）

P0（必须）：

1. 首页双入口 + 路由骨架
2. 用户流程核心链路
3. 商家意图列表 + 历史
4. 统一状态机与错误提示

P1（增强）：

1. 商家总览 KPI
2. 用户消费统计
3. 后端聚合/过滤接口

P2（体验优化）：

1. 更完整图表与导出能力
2. 细粒度权限与角色会话管理

