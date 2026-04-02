# PayFi Demo × HashKey Chain Hackathon

> **目标**：在 HashKey Chain Testnet 上演示完整的 PayFi 支付流程。  
> **演示结果**：用户通过 OKX Wallet 授权付款 → HashKey Gateway 将 USDC 直接打入 Escrow 合约 → 双签分期释放 → 退款，全程链上可验证（Blockscout）。  
> **分支名**：`feat/hashkey-chain-hackathon`

---

## 分支创建

```bash
git checkout main
git pull origin main
git checkout -b feat/hashkey-chain-hackathon
git push -u origin feat/hashkey-chain-hackathon
```

---

## 演示操作顺序（Demo Script）

> 倒推依据：演示效果 → 需要哪些功能 → 对应代码修改。

```
Step 1  创建意图           POST /api/payfi/v1/intents
         └─ 后端自动向 HashKey Gateway 创建 Reusable Order
         └─ 返回 payment_url 给前端

Step 2  展示 HashKey 支付页  打开 payment_url（官方 Checkout，品牌背书）

Step 3  OKX Wallet 签名    用户 EIP-3009 授权，Gateway 代发 tx
         └─ pay_to = PayFiEscrow 合约地址
         └─ USDC 直接进入 Escrow

Step 4  Webhook 触发       payfidemo 收到 payment-successful
         └─ 监听 ERC20 Transfer 事件，解析 escrowId（或由 intent 映射）
         └─ intent 状态 pending → funded
         └─ Blockscout 展示：EscrowCreated / Transfer 事件

Step 5  商家触发释放        POST .../release/prepare → 双签 → release/submit
         └─ releaseBySignatures 执行，10 USDC → 商家钱包
         └─ Blockscout 展示：Released 事件

Step 6  退款演示（可选）    POST .../refund
         └─ 剩余 USDC → 用户钱包
         └─ Blockscout 展示：Refunded 事件
```

---

## 现状 Gap 分析

| 现有（main 分支）                  | 黑客松需要                                      |
|-------------------------------|---------------------------------------------|
| Anvil / Sepolia 本地测试          | HashKey Chain Testnet (Chain ID: 133)        |
| MockERC20 + 内存 escrowId       | 真实 USDC on HashKey Chain Testnet           |
| Mock HSP outbox               | HashKey Merchant Gateway（真实 API）           |
| `createAndDeposit` 用户直接调用    | Gateway EIP-3009 打款到 Escrow，合约接收 Transfer |
| 无持久化                          | SQLite 落库（intent + events）                 |
| 无 webhook 接收                  | `/webhooks/hashkey` 端点 + HMAC 验签           |
| 无前端                           | 最简演示 HTML + OKX Wallet 连接                 |

---

## 分阶段工作内容

---

### Phase 0 — 环境与分支准备（1h）

**目标**：新分支可以运行，环境变量对齐 HashKey Chain。

**工作内容**：

1. 创建分支 `feat/hashkey-chain-hackathon`
2. 复制 `.env.example`，新增以下变量：

```bash
# HashKey Chain Testnet
CHAIN_ID=133
CHAIN_RPC_URL=https://hashkeychain-testnet.alt.technology
CHAIN_NETWORK=hashkey-testnet

# USDC on HashKey Chain Testnet (官方文档地址)
USDC_CONTRACT=0x79AEc4EeA31D50792F61D1Ca0733C18c89524C9e

# Escrow 合约（Phase 1 部署后填入）
ESCROW_ADDRESS=

# HashKey Merchant Gateway
HASHKEY_BASE_URL=https://merchant-qa.hashkeymerchant.com
APP_KEY=
APP_SECRET=
MERCHANT_PRIVATE_KEY_PATH=./keys/merchant_private_key.pem
MERCHANT_NAME=PayFiDemo

# OKX Wallet / 演示账户
SUBMITTER_PRIVATE_KEY=

# Blockscout
BLOCKSCOUT_URL=https://hashkey.blockscout.com
```

3. 生成商户密钥对，**不提交私钥**：

```bash
mkdir -p keys
openssl ecparam -name secp256k1 -genkey -noout -out keys/merchant_private_key.pem
openssl ec -in keys/merchant_private_key.pem -pubout -out keys/merchant_public_key.pem
echo "keys/merchant_private_key.pem" >> .gitignore
```

4. 向 `hsp_hackathon@hashkey.com` 发送注册邮件，附上 `merchant_public_key.pem`，等待 `app_key` / `app_secret`。

**等待期间并行推进 Phase 1 和 Phase 2。**

---

### Phase 1 — 合约适配：接收 EIP-3009 Transfer（3h）

**目标**：`PayFiEscrow.sol` 支持 Option A——Gateway 直接将 USDC 打入合约，合约通过 `receiveDeposit` 绑定 intent。

**核心变更**：原来 `createAndDeposit` 需要用户显式调用；现在 Gateway 用 EIP-3009 `transferWithAuthorization` 把 USDC 发到合约地址，合约需要一个方法让 submitter 在 Transfer 发生后绑定 escrow。

**`contracts/PayFiEscrow.sol` 新增**：

```solidity
// 新增：Gateway 转账后，由 submitter 调用绑定 intent
// intentId = keccak256(abi.encodePacked(user, merchant, nonce))
function registerDeposit(
    bytes32 escrowId,
    address user,
    address merchant,
    address asset,
    uint256 amountTotal,
    uint256 amountPerRelease,
    uint256 maxReleases,
    uint256 expiresAt
) external onlySubmitter {
    require(escrows[escrowId].user == address(0), "already registered");

    // 验证合约已收到足额 USDC
    uint256 bal = IERC20(asset).balanceOf(address(this));
    require(bal >= _totalLocked() + amountTotal, "insufficient balance");

    escrows[escrowId] = Escrow({
        user: user,
        merchant: merchant,
        asset: asset,
        amountTotal: amountTotal,
        amountPerRelease: amountPerRelease,
        maxReleases: maxReleases,
        releasesDone: 0,
        expiresAt: expiresAt,
        funded: true
    });

    emit EscrowRegistered(escrowId, user, merchant, amountTotal);
}
```

**部署到 HashKey Chain Testnet**：

```bash
# foundry.toml 新增 hashkey-testnet profile
forge script script/DeployPayFiEscrow.s.sol:DeployPayFiEscrow \
  --rpc-url $CHAIN_RPC_URL \
  --private-key $SUBMITTER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://hashkey.blockscout.com/api/
```

部署后将合约地址填入 `ESCROW_ADDRESS`。

**新增部署脚本** `script/DeployHashKey.s.sol`（不依赖 MockERC20，直接用真实 USDC 地址）。

**测试**：

```bash
forge test --fork-url $CHAIN_RPC_URL -vvv
```

**时间估算**：合约修改 1.5h + 部署调试 1h + 测试 0.5h = **3h**

---

### Phase 2 — 持久化：SQLite 替换内存 Map（2h）

**目标**：intent 状态跨重启存活，支持 webhook 更新。

**新建 `src/db.ts`**：

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'payfidemo.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS intents (
    intent_id         TEXT PRIMARY KEY,
    status            TEXT NOT NULL DEFAULT 'pending',
    merchant          TEXT NOT NULL,
    user_addr         TEXT NOT NULL,
    asset             TEXT NOT NULL,
    amount_total      TEXT NOT NULL,
    amount_per_release TEXT NOT NULL,
    max_releases      INTEGER NOT NULL,
    releases_done     INTEGER NOT NULL DEFAULT 0,
    escrow_id         TEXT,
    funding_tx        TEXT,
    payment_url       TEXT,
    hsk_payment_req_id TEXT,
    expires_at        TEXT NOT NULL,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_id   TEXT NOT NULL,
    type        TEXT NOT NULL,
    payload     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

export { db };
```

**修改范围**：将 `src/` 中所有 `intentStore.set` / `intentStore.get` 替换为 `db` 操作（约 5 个文件）。

**时间估算**：**2h**

---

### Phase 3 — HashKey 认证层（3h）

**目标**：能向 HashKey Merchant QA 发送合法签名请求。

**新建 `src/hashkey/canonical.ts`**：

```typescript
import crypto from 'crypto';

function sortKeys(val: unknown): unknown {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return (val as unknown[]).map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(val as object).sort()) {
    sorted[key] = sortKeys((val as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function canonicalHash(obj: object): string {
  const str = JSON.stringify(sortKeys(obj));
  return crypto.createHash('sha256').update(str).digest('hex');
}
```

**新建 `src/hashkey/auth.ts`**：

```typescript
import crypto from 'crypto';

export function buildHmacHeaders(
  method: string,
  path: string,
  query: string,
  body: string,
  appKey: string,
  appSecret: string
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = body
    ? crypto.createHash('sha256').update(body, 'utf8').digest('hex')
    : '';
  const message = [method, path, query, bodyHash, timestamp, nonce].join('\n');
  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(message)
    .digest('hex');
  return {
    'X-App-Key': appKey,
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'Content-Type': 'application/json',
  };
}
```

**新建 `src/hashkey/jwt.ts`**（ES256K，依赖 `jose`）：

```typescript
import { SignJWT } from 'jose';
import { createPrivateKey } from 'crypto';
import { readFileSync } from 'fs';
import { canonicalHash } from './canonical';

export async function buildMerchantJWT(cartContents: object): Promise<string> {
  const pem = readFileSync(process.env.MERCHANT_PRIVATE_KEY_PATH!);
  const privateKey = createPrivateKey(pem);
  const cartHash = canonicalHash(cartContents);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    iss: process.env.MERCHANT_NAME,
    sub: process.env.MERCHANT_NAME,
    aud: 'HashkeyMerchant',
    iat: now,
    exp: now + 3600,
    jti: `JWT-${now}-${crypto.randomUUID()}`,
    cart_hash: cartHash,
  })
    .setProtectedHeader({ alg: 'ES256K', typ: 'JWT' })
    .sign(privateKey);
}
```

```bash
npm install jose better-sqlite3 @types/better-sqlite3
```

**时间估算**：**3h**

---

### Phase 4 — HashKey Gateway 对接：创建 Reusable Order（2.5h）

**目标**：`POST /intents` 触发后，自动向 HashKey 创建 Reusable Order，拿回 `payment_url`。

**新建 `src/hashkey/client.ts`**：

```typescript
import { buildHmacHeaders } from './auth';
import { buildMerchantJWT } from './jwt';

const BASE = process.env.HASHKEY_BASE_URL!;

export function buildCartContents(intent: {
  intentId: string;
  merchant: string;
  amountTotal: string;
}) {
  const amountUSD = (Number(intent.amountTotal) / 1e6).toFixed(2);
  return {
    id: intent.intentId,
    user_cart_confirmation_required: true,
    payment_request: {
      method_data: [{
        supported_methods: 'https://www.x402.org/',
        data: {
          x402Version: 2,
          network: process.env.CHAIN_NETWORK,       // 'hashkey-testnet'
          chain_id: parseInt(process.env.CHAIN_ID!),
          contract_address: process.env.USDC_CONTRACT,
          pay_to: process.env.ESCROW_ADDRESS,        // ← Option A 关键
          coin: 'USDC',
        },
      }],
      details: {
        id: `PAY-REQ-${intent.intentId}`,
        display_items: [{
          label: 'PayFi Escrow Deposit',
          amount: { currency: 'USD', value: amountUSD },
        }],
        total: {
          label: 'Total',
          amount: { currency: 'USD', value: amountUSD },
        },
      },
    },
    // Reusable order: 365 天覆盖全生命周期
    cart_expiry: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    merchant_name: process.env.MERCHANT_NAME,
  };
}

export async function createReusableOrder(intentId: string, merchant: string, amountTotal: string) {
  const contents = buildCartContents({ intentId, merchant, amountTotal });
  const jwt = await buildMerchantJWT(contents);
  const body = JSON.stringify({
    cart_mandate: { contents, merchant_authorization: jwt },
    redirect_url: `${process.env.BASE_URL}/payment/result`,
  });

  const headers = buildHmacHeaders(
    'POST', '/api/v1/merchant/orders/reusable', '', body,
    process.env.APP_KEY!, process.env.APP_SECRET!
  );

  const res = await fetch(`${BASE}/api/v1/merchant/orders/reusable`, {
    method: 'POST', headers, body,
  });
  if (!res.ok) throw new Error(`HashKey API error: ${res.status} ${await res.text()}`);
  return res.json();
}
```

**修改 `src/routes/intents.ts`**（POST /intents 末尾追加）：

```typescript
// 创建意图后，向 HashKey 创建 Reusable Order
try {
  const hskRes = await createReusableOrder(intent.intentId, intent.merchant, intent.amountTotal);
  db.prepare(`UPDATE intents SET payment_url = ?, hsk_payment_req_id = ? WHERE intent_id = ?`)
    .run(hskRes.data.payment_url, hskRes.data.payment_request_id, intent.intentId);
  intent.paymentUrl = hskRes.data.payment_url;
} catch (e) {
  console.error('[HashKey] createReusableOrder failed:', e);
  // 降级：仍然返回 intent，演示时可手动补
}
```

**时间估算**：**2.5h**

---

### Phase 5 — Webhook 接收 + Escrow 注册（3h）

**目标**：收到 `payment-successful` → 验签 → 调用合约 `registerDeposit`。

**Hono 保留原始 body 中间件**：

```typescript
// src/index.ts
app.use('/webhooks/*', async (c, next) => {
  const raw = await c.req.text();
  c.set('rawBody', raw);
  await next();
});
```

**新建 `src/routes/webhook.ts`**：

```typescript
import { Hono } from 'hono';
import crypto from 'crypto';
import { db } from '../db';
import { registerEscrowOnChain } from '../chain/escrow';

const webhook = new Hono();

function verifyWebhookSig(sig: string, rawBody: string, secret: string): boolean {
  const parts = Object.fromEntries(
    sig.split(',').map(p => { const [k, v] = p.split('='); return [k, v]; })
  );
  const ts = parseInt(parts['t'] ?? '0');
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts['v1'] ?? ''));
}

webhook.post('/webhooks/hashkey', async (c) => {
  const rawBody = c.get('rawBody') as string;
  const sig = c.req.header('x-signature') ?? '';

  if (!verifyWebhookSig(sig, rawBody, process.env.APP_SECRET!)) {
    return c.json({ error: 'invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody);
  const { cart_mandate_id, status, tx_signature, amount } = payload;

  // 幂等：任何情况都先 200
  const intent = db.prepare('SELECT * FROM intents WHERE intent_id = ?').get(cart_mandate_id);
  if (!intent) return c.json({ code: 0 });
  if ((intent as any).status !== 'pending') return c.json({ code: 0 }); // 已处理

  if (status === 'payment-successful') {
    try {
      // 调用合约 registerDeposit，绑定 escrowId
      const escrowId = await registerEscrowOnChain(intent as any, tx_signature);

      db.prepare(`
        UPDATE intents
        SET status = 'funded', funding_tx = ?, escrow_id = ?, updated_at = datetime('now')
        WHERE intent_id = ?
      `).run(tx_signature, escrowId, cart_mandate_id);

      db.prepare(`INSERT INTO events (intent_id, type, payload) VALUES (?, ?, ?)`)
        .run(cart_mandate_id, 'funded', JSON.stringify(payload));

      console.log(`[Webhook] intent ${cart_mandate_id} funded, escrowId: ${escrowId}`);
    } catch (e) {
      console.error('[Webhook] registerEscrow failed:', e);
    }
  } else if (status === 'payment-failed') {
    db.prepare(`UPDATE intents SET status = 'failed', updated_at = datetime('now') WHERE intent_id = ?`)
      .run(cart_mandate_id);
  }

  return c.json({ code: 0 });
});

export default webhook;
```

**新建 `src/chain/escrow.ts`**（调用合约 `registerDeposit`）：

```typescript
import { ethers } from 'ethers';
import escrowABI from '../../artifacts/contracts/PayFiEscrow.sol/PayFiEscrow.json';

const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
const submitter = new ethers.Wallet(process.env.SUBMITTER_PRIVATE_KEY!, provider);
const escrow = new ethers.Contract(process.env.ESCROW_ADDRESS!, escrowABI.abi, submitter);

export async function registerEscrowOnChain(intent: any, txHash: string): Promise<string> {
  // escrowId = keccak256(intentId) — 与前端保持一致
  const escrowId = ethers.keccak256(ethers.toUtf8Bytes(intent.intent_id));

  const tx = await escrow.registerDeposit(
    escrowId,
    intent.user_addr,
    intent.merchant,
    process.env.USDC_CONTRACT,
    BigInt(intent.amount_total),
    BigInt(intent.amount_per_release),
    intent.max_releases,
    Math.floor(new Date(intent.expires_at).getTime() / 1000)
  );
  await tx.wait();
  console.log(`[Chain] registerDeposit tx: ${tx.hash}`);
  return escrowId;
}
```

**时间估算**：webhook 路由 1.5h + chain 调用 1h + 测试 0.5h = **3h**

---

### Phase 6 — 演示前端（2h）

**目标**：一个可以在黑客松现场操作的最简 HTML 页面，支持 OKX Wallet 连接。

**新建 `public/demo.html`**（Hono 静态文件服务）：

核心功能：
- 连接 OKX Wallet（`window.okxwallet`）
- 显示当前钱包地址和 HashKey Chain Testnet 网络
- 创建意图表单（输入金额、商家地址）→ 调用 `/api/payfi/v1/intents`
- 显示 `payment_url`，弹出 HashKey 支付页
- 查询 intent 状态，显示当前阶段
- Release 按钮（触发双签流程）
- Blockscout 链接（点击跳转查看 tx）

**OKX Wallet 连接片段**：

```html
<script>
async function connectOKX() {
  if (!window.okxwallet) {
    alert('请安装 OKX Wallet 扩展');
    return;
  }
  const accounts = await window.okxwallet.request({ method: 'eth_requestAccounts' });

  // 切换到 HashKey Chain Testnet
  try {
    await window.okxwallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x85' }], // 133 in hex
    });
  } catch (e) {
    // 网络不存在则添加
    await window.okxwallet.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: '0x85',
        chainName: 'HashKey Chain Testnet',
        nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
        rpcUrls: ['https://hashkeychain-testnet.alt.technology'],
        blockExplorerUrls: ['https://hashkey.blockscout.com'],
      }],
    });
  }

  document.getElementById('wallet-addr').textContent = accounts[0];
}
</script>
```

**时间估算**：**2h**

---

### Phase 7 — 联调 & 演示排练（2h）

**清单**：

- [ ] ngrok 暴露本地端口，配置到 HashKey 控制台 webhook URL
- [ ] 用真实 USDC (HashKey Chain Testnet) 跑完整流程一遍
- [ ] 确认 Blockscout 能搜到 `EscrowRegistered` / `Released` / `Refunded` 事件
- [ ] OKX Wallet 签名体验顺畅
- [ ] 准备 Blockscout 演示页面（提前打开 tx 链接备用）
- [ ] 录制一段 backup 视频（网络不稳定时备用）

**时间估算**：**2h**

---

## 工时汇总

| Phase | 内容                              | 工时   | 可并行       |
|-------|-----------------------------------|--------|------------|
| 0     | 环境 + 分支 + 密钥对 + 注册邮件     | 1h     | —          |
| 1     | 合约适配 `registerDeposit` + 部署  | 3h     | 可与 2 并行  |
| 2     | SQLite 持久化替换内存 Map           | 2h     | 可与 1 并行  |
| 3     | HashKey 认证层（HMAC + JWT）       | 3h     | 等待凭证期间  |
| 4     | Gateway 对接 createReusableOrder  | 2.5h   | 需要凭证     |
| 5     | Webhook 接收 + registerDeposit    | 3h     | 需要 Phase 4 |
| 6     | 演示前端（OKX Wallet）             | 2h     | 可与 5 并行  |
| 7     | 联调 + 演示排练                    | 2h     | 最后        |
| **合计** |                               | **~18.5h** |         |

> Phase 1 + 2 并行、Phase 3 在等待凭证期间完成，实际连续工作时间约 **12–14h**（两天节奏）。

---

## 关键风险与应对

| 风险 | 概率 | 应对 |
|---|---|---|
| HashKey 凭证未及时到达 | 中 | Phase 3 预先完成，凭证到即可接上 |
| Gateway EIP-3009 与 HashKey Chain Testnet USDC 兼容问题 | 中 | 提前用 curl 测试 POST /merchant/orders/reusable |
| `registerDeposit` 余额校验不准确（并发冲突）| 低 | 演示时单笔流程，无并发 |
| ngrok 断连导致 webhook 失败 | 低 | 准备 polling fallback：`GET /intents/:id/payment-status` |
| OKX Wallet HashKey Chain 网络支持问题 | 低 | 提前在 OKX Wallet 手动添加网络并测试 |

---

## 文件结构变更（仅新增 / 修改）

```
payfidemo/
├── contracts/
│   └── PayFiEscrow.sol              # 新增 registerDeposit()
├── script/
│   └── DeployHashKey.s.sol          # 新增，不依赖 MockERC20
├── src/
│   ├── db.ts                        # 新增，SQLite
│   ├── hashkey/
│   │   ├── auth.ts                  # 新增，HMAC
│   │   ├── canonical.ts             # 新增，Canonical JSON
│   │   ├── client.ts                # 新增，createReusableOrder
│   │   └── jwt.ts                   # 新增，ES256K JWT
│   ├── chain/
│   │   └── escrow.ts                # 新增，registerDeposit 调用
│   └── routes/
│       ├── intents.ts               # 修改，串联 HashKey order
│       └── webhook.ts               # 新增，接收 HashKey callback
├── public/
│   └── demo.html                    # 新增，演示前端
├── keys/
│   └── merchant_public_key.pem      # 提交，私钥不提交
├── .env.example                     # 更新，新增 HashKey 变量
└── HACKATHON-HASHKEY.md             # 本文件
```

---

## 注册邮件模板

```
To: hsp_hackathon@hashkey.com
Subject: HashKey Merchant Registration - PayFiDemo Hackathon

Hi HashKey Team,

We are participating in the hackathon and would like to register as a merchant.

organization_name: PayFiDemo
email: [your email]
default_language: en
supported_chain_tokens:
  - network: hashkey-testnet, chain_id: 133, token: USDC
  - network: sepolia, chain_id: 11155111, token: USDC

Public key (PEM) attached.

GitHub: https://github.com/AlphaVeteran/payfidemo
Branch: feat/hashkey-chain-hackathon

Thank you.
```

---

*Generated for PayFiDemo × HashKey Chain Hackathon — Branch: `feat/hashkey-chain-hackathon`*
