# PayFiDemo UI 设计文档（用户/商家双入口）

## 1. 文档目标

基于当前 PayFiDemo 已实现能力，规划一套用户与商家都可直接上手的交互流程，满足以下目标：

- 用户无需额外指导即可完成支付流程。
- 商家可快速定位待处理任务并完成结算操作。
- 双方可随时查询账户金额、支付状态与历史记录。
- 中断后可通过 `intentId` 快速恢复流程。

---

## 2. 当前能力边界（用于 UI 对齐）

已实现核心链路：

1. `Create Intent`
2. `Fund Escrow`（approve + createAndDeposit + funding/tx）
3. `Release Prepare`（EIP-712 typed data）
4. `Dual Sign + Release Submit`
5. `Refund`（到期后）
6. `History/Audit`（intents + mock outbox/webhook 事件）

主要可用接口（现状）：

- `GET /api/payfi/v1/intents`
- `POST /api/payfi/v1/intents`
- `GET /api/payfi/v1/intents/:id`
- `GET /api/payfi/v1/intents/:id/funding/hint`
- `POST /api/payfi/v1/intents/:id/funding/tx`
- `POST /api/payfi/v1/intents/:id/release/prepare`
- `POST /api/payfi/v1/intents/:id/release/submit`
- `POST /api/payfi/v1/intents/:id/refund`
- `GET /api/payfi/v1/debug/hsp-outbox`

---

## 3. 角色与入口策略

首页采用双入口分流：

- 用户入口（User）
- 商家入口（Merchant）

并保留统一恢复入口：

- 输入 `intentId` 继续上次流程
- 最近记录快捷进入

设计原则：

- 首屏只做角色分流与快速恢复，不堆叠复杂字段。
- 分流后按任务导向展示“下一步动作”。
- 所有关键页保留 `intentId + 状态 + 刷新`。

---

## 4. 路由规划

- `/`：角色选择首页（User / Merchant）
- `/user`：用户工作台
- `/merchant`：商家控制台
- `/intent/[intentId]?role=user|merchant`：意图详情页（按角色控制操作权限与文案）

本地记忆建议：

- `localStorage.payfi.role = user | merchant`
- `localStorage.payfi.lastIntentId = <id>`

---

## 5. 首页交互设计（双入口）

页面结构：

1. 顶部：项目标题、链状态、钱包连接
2. 中部：两张角色入口卡片
   - 用户卡：`我要支付并跟踪进度`
   - 商家卡：`我要查看意图并处理结算`
3. 底部：继续上次流程
   - `intentId` 输入框 + 继续按钮
   - 最近 5 条记录（可点击）

跳转规则：

- 点击用户入口 -> `/user`
- 点击商家入口 -> `/merchant`
- 输入 `intentId` 继续 -> `/intent/:id?role=<lastRole|user>`
- 点击最近记录 -> `/intent/:id?role=<lastRole>`

---

## 6. 用户端流程设计（User Journey）

## Step 1: 创建意图（Create Intent）

- 表单化输入基础字段（用户地址、商家地址、资产、总额、单次结算额、释放次数、有效期）。
- 高级参数折叠（agreementHash、termsVersion、webhook 等）。
- 主按钮：`创建并继续`。
- 成功后直接进入 `/intent/:id?role=user`，自动定位下一步。

## Step 2: 资金托管（Fund Escrow）

- 子步骤按钮：
  - `1) 授权代币`
  - `2) 存入托管`
- 每个动作显示状态：`待操作 / 钱包确认中 / 链上确认中 / 已完成`。
- 完成后自动刷新 intent 状态并解锁下一步。

## Step 3: 用户签名（Release - User）

- 引导用户完成 EIP-712 用户签名。
- 成功后提示：`已完成用户签名，等待商家签名`。

## Step 4: 状态跟踪与历史

- 显示：当前状态、已释放金额、剩余金额、释放次数。
- 展示事件时间线（funded/released/refunded）。

## Step 5: 退款（条件触发）

- 仅在到期且可退款时展示 `申请退款`。
- 退款成功后进入只读完成态。

---

## 7. 商家端流程设计（Merchant Journey）

商家入口默认落地“待办优先”视角：

1. 待支付意图数量
2. 待商家签名数量
3. 今日已结算金额
4. 已退款金额

核心页面：

### 7.1 总览（Dashboard）

- KPI 卡片：新增意图、待支付、托管中、已结算金额、已退款金额。
- 最近意图列表 + 待处理动作清单（例如：等待商家签名）。

### 7.2 用户意图（Intents）

列表字段：

- intentId
- 用户地址
- 总金额
- 已释放/总额
- 状态
- 创建时间
- 操作（查看详情）

筛选能力：

- 按状态
- 按用户地址
- 按时间区间
- 按 intentId 关键词

详情页展示：

- 意图基本信息（user/merchant/asset/amount）
- 支付状态进度
- 商家可执行动作（签名、提交 release、查看 tx）

### 7.3 支付历史（History）

按时间倒序展示事件流：

- `INTENT_CREATED`
- `INTENT_FUNDED`
- `SETTLEMENT_RELEASED`
- `INTENT_REFUNDED`

每条记录展示：事件类型、intentId、用户地址、金额、txHash、时间戳、来源。

### 7.4 用户消费分析（User Spend）

按用户地址查询并展示：

- 累计消费总额
- 已结算金额
- 托管中金额
- 退款金额
- 意图数量/释放次数

并显示该用户对应 intent 明细列表。

---

## 8. 统一状态机与动作控制

以 `intent.status` 驱动界面动作：

- `awaiting_funding`
  - 用户：可执行授权/入金
  - 商家：只读，提示等待用户支付
- `active`
  - 用户：可进行用户签名
  - 商家：可进行商家签名（或等待 userSig）
  - 双签齐后可提交 release
- `partially_settled`
  - 同 `active`，并展示已释放进度
- `settled`
  - 完成态，只读
- `refunded`
  - 完成态，只读

按钮状态建议统一：

- `idle`
- `pending_wallet`
- `pending_chain`
- `success`
- `error`

---

## 9. 文案与视觉规范

状态文案映射：

- `awaiting_funding` -> 待支付
- `active` -> 托管中
- `partially_settled` -> 部分结算
- `settled` -> 已结算
- `refunded` -> 已退款

建议色彩：

- 待支付：蓝
- 托管中：绿
- 部分结算：橙
- 已结算：青
- 已退款：灰

核心文案：

- 用户入口：`我要支付并跟踪进度`
- 商家入口：`我要查看意图并处理结算`
- 快捷恢复：`继续上次流程（输入 intentId）`

---

## 10. 前端组件拆分建议

建议新增/拆分组件：

- `components/home/role-entry.tsx`（首页双入口）
- `components/shared/intent-status-header.tsx`
- `components/user/intent-wizard.tsx`
- `components/merchant/merchant-shell.tsx`
- `components/merchant/dashboard-panel.tsx`
- `components/merchant/intents-table.tsx`
- `components/merchant/intent-detail-drawer.tsx`
- `components/merchant/history-timeline.tsx`
- `components/merchant/user-spend-panel.tsx`

实现优先级：

1. P0：双入口首页 + Intents 列表 + Intent 详情状态机
2. P1：History 时间线 + Dashboard 指标卡
3. P2：User Spend（特定用户消费统计）

---

## 11. 验收标准（Definition of Done）

- 新用户首次进入，无需文档可在 30 秒内找到“下一步操作”。
- 首页可清晰区分用户与商家入口并完成跳转。
- 任意 intent 可通过 `intentId` 恢复并继续流程。
- 商家可看到：
  - 用户意图列表
  - 用户支付状态
  - 支付历史时间线
  - 特定用户消费金额
- 刷新页面后角色与最近 intent 可恢复。

---

## 12. 后续可选接口增强（非阻塞）

在不影响当前上线的前提下，可增加：

- `GET /intents?merchant=&status=&user=&from=&to=`（服务端过滤）
- `GET /merchants/:merchant/stats`（商家总览聚合）
- `GET /merchants/:merchant/users/:user/spend-summary`（用户消费汇总）

说明：上述接口可作为性能与可维护性优化，不影响当前基于现有接口的首版交付。
