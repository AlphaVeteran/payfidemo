# PayFi Cross-border Escrow Demo

Milestone-based escrow for cross-border e-commerce: buyer funds escrow, staged seller releases, refund fallback by policy.

**License:** MIT · Global Hackfest 2026

> **Note:** This folder is the Hackfest submission entry. Full source and runbooks live in the main repository linked below.

## Overview

PayFi Cross-border Escrow Demo models a cross-border e-commerce payment flow: payment intent, on-chain escrow, milestone disbursement, and refund at maturity, with gateway/webhook verification patterns suitable for PayFi prototypes.

## Hackathon Information

- **Event**: Global Hackfest 2026
- **Focus Area**: Open Innovation (Payments / StableCoin Integration)
- **Team**: AlphaVeteran
- **Submission Date**: 2026-04-20 @ 11:59:59

## Team

| Name   | Role       | GitHub                                              | Discord        |
| ------ | ---------- | --------------------------------------------------- | -------------- |
| Ada    | Architect  | [@AlphaVeteran](https://github.com/AlphaVeteran)   | ++alphaoldie++ |
| Yixing | Developer  | [@SauTi9138](https://github.com/SauTi9138)         | lu_yi9138 |

## Problem Statement

Cross-border e-commerce has a trust and settlement gap: buyers want delivery guarantees before full payment release; sellers want certainty after milestones; platforms need transparent, auditable rules.

**RMB (人民币) checkout** is often awkward for buyers: many overseas listings settle in foreign currency; direct RMB paths are limited, so buyers face **extra intermediaries, FX and fee opacity, slower settlement**, and **mismatched** payment–delivery–dispute timelines across borders.

Traditional rails rarely offer programmable milestone settlement with on-chain auditability.

## Solution

**Principles**

1. **Compliance layering** — Onshore funds stay onshore; offshore settlement completes on **eSpace**; onshore intent and commitment align with **Core Space** (PoC: mapped business loop; full fund path is roadmap).
2. **No custodial risk** — Collateral is locked in **contracts**; neither party can unilaterally withdraw; release/refund follow on-chain rules.
3. **Conflux strengths** — **Gas sponsorship** lowers user friction; **Core + eSpace** separates onshore/offshore logic while preserving one product story.

**Flow**

- Buyer authorizes tokens and deposits (Core: `CoreOrderVault`; eSpace: escrow via adapter).
- Seller fulfillment maps to milestone release; platform policy governs release/refund.
- Relayer maps Core `OrderDeposited` to eSpace `createEscrowFromCore` for the cross-space narrative (Phase 1: event-mapping loop; real fund bridging is roadmap).

### Cross-space flow (ASCII)

```text
                    Core Space（在岸 CNY）                    Relayer                    eSpace（离岸 AxCNH）
                    Chain ID 1 · Fluent Wallet              监听 Core 事件              Chain ID 71 · MetaMask
                    ─────────────────────────               ─────────────               ──────────────────────

 eSpace 侧                         ┌─────────────────────┐
 ① 约定跨境合同                    │                     │
 买家+卖家 · eSpace 签约           │                     │
       │                           │                     │
       │  ························>│  (跨空间约定)        │
       │                           │                     │
       │                           ▼                     │
       │                    ┌──────────────┐             │
       │                    │ ② 买家下单   │             │
       │                    │ + 锁定保证金 │             │
       │                    │ CoreOrderVault│            │
       │                    │ · 在岸人民币 │             │
       │                    └──────┬───────┘             │
       │                           │                     │
       │                           ▼                     │
       │                    ┌──────────────┐             │
       │                    │ OrderDeposited│            │
       │                    │   事件上链    │             │
       │                    └──────┬───────┘             │
       │                           │                     │
       │                           │  ────────────────>  │
       │                           │   (Core → Relayer)  │
       │                           │                     │
       │                           │                     ▼
       │                           │              ┌──────────────┐
       │                           │              │ ③ 创建 Escrow │
       │                           │              │ ESpaceEscrow  │
       │                           │              │ Adapter · id  │
       │                           │              └──────┬───────┘
       │                           │                     │
       │                           │                     ▼
       │                           │              ┌──────────────┐
       │                           │              │ ④ 映射入金    │
       │                           │              └──────┬───────┘
       │                           │                     │
       │                           │                     ▼
       │                           │              ┌──────────────┐
       │                           │              │⑤ 双签确认放款 │
       │                           │              │ PayFiEscrow  │
       │                           │              │ 买方+卖方签名 │
       │                           │              └──────┬───────┘
       │                           │                     │
       │                           │    ┌────────────────┘
       │                           │    │  ⑤ ↔ ⑥ 可多轮（虚线往返）
       │                           │    └────────────────┐
       │                           │                     ▼
       │                           │              ┌──────────────┐
       │                           │              │⑥ AxCNH 离岸放款│
       │                           │              │ 转卖方 · eSpace │
       │                           │              │   结算完成      │
       │                           │              └──────────────┘
       │                           │                     │
       ▼                           │                     │
 (流程继续)                        │                     │

════════════════════════════════════  到期 / 纠纷路径  ════════════════════════════════════

       Core Space                                              eSpace
       ·············                                             ·········
             │                                                       │
             │ (从 OrderDeposited / ② 区向下，虚线)                      │ (从 ⑥ 向下，虚线)
             ▼                                                       ▼
       ┌──────────────┐                                    ┌──────────────┐
       │ 超时自动退回   │                                    │ 纠纷 / 仲裁   │
       │ 保证金退买家   │                                    │ 多签裁决      │
       │ · Core Space │                                    │ 资金定向释放   │
       └──────────────┘                                    └──────────────┘
```

## Go-to-Market Plan

- **Phase 1 (1 month):** Demo → **open tool** for independent external use; **3–5 seed users** (priority: event-facing cross-border traders + Web3-native payment teams).
- **Phase 2 (2 months):** Demo → **commercial PoC**; **1–2 MOUs**; real corridor (**Shanghai → SE Asia** or **HK → Belt & Road**); ship **TypeScript SDK**; success = **3 external devs** integrate **unaided**.
- **Phase 3 (3 months):** First **real AxCNH** cross-border settlement on **mainnet** + on-chain proof for investors; content push for **1× PANews or The Block** tier coverage.

## Conflux Integration

- **Core Space**: `CoreOrderVault` — order deposit; `OrderDeposited` for relayer. (Conflux Core testnet `chainId = 1` — not Ethereum mainnet.)
- **eSpace**: `PayFiEscrow`, `ESpaceEscrowAdapter` — escrow lifecycle on eSpace testnet (EVM `chainId` **71**).
- **Cross-Space**: Core event → eSpace escrow mapping → release/refund demo path.
- **Gas sponsorship**: lowers user friction when enabled in deployment.

### Deployed contracts (testnet — verify before submit)

| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| CoreOrderVault         | `0xAe26E03F8C0E7c8B0ACe8dc8B825A498f8925Fdf` |
| ESpaceEscrowAdapter    | `0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38` |
| PayFiEscrow            | `0x44898c384Af98dBB3666E0c0dD9dA643547863a6` |
| MockERC20 (demo asset) | `0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca` |

**Example txs:** Approve `0x407e0c9ee6c4a21c3a43e04e93f99993942c5d992970792a87972bfa9ab70dfa` · Core deposit `0x6c3cde5d1adffb3fd983005ff09c0573a436c4f20ee995fa311c274cfa475bf4` · eSpace mapping `0x300c7ec833c0633cebdc0642d5f9ea303c0525c57cfd77f7b15e2adb3de9edea`

**Explorer:** [Conflux eSpace testnet](https://evmtestnet.confluxscan.io/) — use `/address/<checksum>` for the contract addresses above.

## Features

- Escrow funding, milestone release, refund fallback; API + frontend lifecycle visibility.
- Cross-space PoC: Core deposit → relayer → eSpace escrow.

## Technology Stack

- **Frontend**: Next.js 15, React 19, wagmi, viem, Tailwind CSS 4
- **Backend**: Node.js (Express), viem, PostgreSQL (Neon) / memory fallback
- **Contracts**: Solidity (Foundry)
- **Conflux**: Core + eSpace testnet

## Testing

Cross-space and escrow flows are validated end-to-end on **Conflux Core Testnet** (`chainId` **1**, Fluent) and **Conflux eSpace Testnet** (`chainId` **71**, MetaMask). Full step-by-step instructions (Chinese), env vars, contract tables, and troubleshooting: [`docs/cross-space-intent-test-guide.zh.md`](https://github.com/AlphaVeteran/payfidemo/blob/feat/conflux-hackfest-2026/docs/cross-space-intent-test-guide.zh.md) in the main repo.

### Scope

- **In scope:** Core `placeOrderDeposit` → Relayer listens for `OrderDeposited` → eSpace `createEscrowFromCore`; frontend **intent** creation; eSpace **Approve + Deposit**; **dual-signature** milestone releases; optional **refund** after expiry.
- **PoC boundary:** Event-mapping loop (Core event → eSpace escrow). **No** production cross-space asset bridge yet.

### Roles

| Role | Responsibility |
| --- | --- |
| `admin` | Deploy/config, overall control |
| `relayer` | Watches Core, calls eSpace adapter |
| `buyer` | Core order + eSpace user flows |
| `seller` | Seller console: sign and releases |

Use **distinct addresses** (e.g. different HD indices) per role when testing.

### Local stack (three terminals)

From the main repo, with `conflux-testnet` env applied:

1. **API:** `npm run env:switch:conflux-testnet` → `npm run dev:conflux-testnet`
2. **Frontend:** `npm run dev:frontend`
3. **Relayer:** `npm run relayer:core-to-espace`

Expect relayer logs such as `mapped coreOrder=…` after a Core deposit when the pipeline is healthy.

### Test cases (pass criteria)

| ID | Scenario | What to verify |
| --- | --- | --- |
| **A** | Core order → eSpace map | Run `npm run demo:cross-space` with buyer on Core; logs show `core order placed`, relayer `mapped coreOrder=…`, demo `mapped to escrowId=…`; record `coreOrderId` and `escrowId`. |
| **B** | New intent (eSpace) | Buyer on eSpace: create intent (seller address, total, installments, duration); `intentId` shown; status `awaiting_funding`; listable in UI. Use **MockERC20** aligned with deployed `PayFiEscrow` (see env / guide). |
| **C** | Fund escrow | Approve + Deposit succeed; status → `active` or `partially_settled`; txs visible on [eSpace testnet explorer](https://evmtestnet.confluxscan.io/). |
| **D** | Dual-sig releases | Buyer signs (user step) → seller signs (merchant) → submit milestone release; `releaseNonce` / `releaseCount` / `releasedTotal` advance; can reach `settled` depending on amounts. |
| **E** (optional) | Refund | After `expiresAt`, “refund remainder” succeeds; status `refunded` or balances reflect return. |

### Mapping IDs (`coreOrderId` / `escrowId` / `intentId`)

Relayer and API link **Core order ↔ eSpace escrow ↔ backend intent**. Query examples (local API port as deployed):

- `GET /api/payfi/v1/intents/core-links/by-core-order/:coreOrderId`
- `GET /api/payfi/v1/intents/core-links/by-escrow/:escrowId`
- `GET /api/payfi/v1/intents/core-links/by-intent/:intentId`

### Acceptance checklist (for judges / internal sign-off)

| Item | Pass? | Evidence |
| --- | --- | --- |
| Core deposit | | Core tx hash |
| eSpace mapping | | Adapter tx hash |
| Create intent | | `intentId` |
| Fund (Approve / Deposit) | | Tx hashes |
| Dual-sig releases | | Release tx + `releaseCount` |
| Refund (optional) | | Refund tx |

Record explorer links for Core and eSpace, and keep `coreOrderId` / `escrowId` / `intentId` together for traceability.

### Contract tests

Solidity tests live with the Foundry workspace in the main repo (`forge test` / project `package.json` scripts — see repo root `README` and `package.json`).

## Repository & Demo

- **Main repo**: [AlphaVeteran/payfidemo @ `feat/conflux-hackfest-2026`](https://github.com/AlphaVeteran/payfidemo/tree/feat/conflux-hackfest-2026)
- **Live demo (Conflux)**: [crossborder-conflux-front.up.railway.app](https://crossborder-conflux-front.up.railway.app)
- **Demo video (≤5 min)**: [YouTube](https://youtu.be/Hx-I4cbZfzg)
- **Participant intro (30–60 s)**: [YouTube](https://www.youtube.com/watch?v=N_ln2n1xECY)

## Submission Links

- **Electric Capital open-dev-data PR**: [PR #2839](https://github.com/electric-capital/open-dev-data/pull/2839)
- **Social post (X)**: [Post](https://x.com/AlphaVeteran0x/status/2046101960626143599?s=20)

## Known Limitations

- Event-mapping PoC first; full cross-space fund bridging is roadmap. Production needs audit and hardening.

## License

MIT
# PayFi Cross-border Escrow Demo

Milestone-based escrow for cross-border e-commerce: buyer funds escrow, staged seller releases, refund fallback by policy.

License: MIT · Global Hackfest 2026

> **Usage:** Copy this file to your fork of [global-hackfest-2026](https://github.com/conflux-fans/global-hackfest-2026) as `projects/<kebab-case-name>/README.md`, then open a PR.

## Overview

PayFi Cross-border Escrow Demo models a cross-border e-commerce payment flow: payment intent, on-chain escrow, milestone disbursement, and refund at maturity, with gateway/webhook verification patterns suitable for PayFi prototypes.

## Hackathon Information

- **Event**: Global Hackfest 2026
- **Focus Area**: Open Innovation (Payments / StableCoin Integration)
- **Team**: *AlphaVeteran*
- **Submission Date**: 2026-04-20 @ 11:59:59

## Team


| Name     | Role        | GitHub                                             | Discord        |
| -------- | ----------- | -------------------------------------------------- | -------------- |
| *Ada*    | *Architect* | *[@AlphaVeteran](https://github.com/AlphaVeteran)* | ++alphaoldie++ |
| *Yixing* | *Developer* | *[@SauTi9138](https://github.com/SauTi9138)*       | *[Discord]*    |


## Problem Statement

Cross-border e-commerce has a trust and settlement gap: buyers want delivery guarantees before full payment release; sellers want certainty after milestones; platforms need transparent, auditable rules.

**RMB (人民币) checkout** is often awkward for buyers: many overseas listings settle in foreign currency; direct RMB paths are limited, so buyers face **extra intermediaries, FX and fee opacity, slower settlement**, and **mismatched** payment–delivery–dispute timelines across borders.

Traditional rails rarely offer programmable milestone settlement with on-chain auditability.

## Solution

**Principles**

1. **Compliance layering** — Onshore funds stay onshore; offshore settlement completes on **eSpace**; onshore intent and commitment align with **Core Space** (PoC: mapped business loop; full fund path is roadmap).
2. **No custodial risk** — Collateral is locked in **contracts**; neither party can unilaterally withdraw; release/refund follow on-chain rules.
3. **Conflux strengths** — **Gas sponsorship** lowers user friction; **Core + eSpace** separates onshore/offshore logic while preserving one product story.

**Flow**

- Buyer authorizes tokens and deposits (Core: `CoreOrderVault`; eSpace: escrow via adapter).
- Seller fulfillment maps to milestone release; platform policy governs release/refund.
- Relayer maps Core `OrderDeposited` to eSpace `createEscrowFromCore` for the cross-space narrative (Phase 1: event-mapping loop; real fund bridging is roadmap).

## Go-to-Market Plan

- **Phase 1 (1 month):** Demo → **open tool** for independent external use; **3–5 seed users** (priority: event-facing cross-border traders + Web3-native payment teams).
- **Phase 2 (2 months):** Demo → **commercial PoC**; **1–2 MOUs**; real corridor (**Shanghai → SE Asia** or **HK → Belt & Road**); ship **TypeScript SDK**; success = **3 external devs** integrate **unaided**.
- **Phase 3 (3 months):** First **real AxCNH** cross-border settlement on **mainnet** + on-chain proof for investors; content push for **1× PANews or The Block** tier coverage.

## Conflux Integration

- **Core Space**: `CoreOrderVault` — order deposit; `OrderDeposited` for relayer. (Conflux Core testnet `chainId = 1` — not Ethereum mainnet.)
- **eSpace**: `PayFiEscrow`, `ESpaceEscrowAdapter` — escrow lifecycle on eSpace testnet (EVM `chainId` **71**).
- **Cross-Space**: Core event → eSpace escrow mapping → release/refund demo path.
- **Gas sponsorship**: lowers user friction when enabled in deployment.

### Deployed contracts (testnet — verify before submit)


| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| CoreOrderVault         | `0xAe26E03F8C0E7c8B0ACe8dc8B825A498f8925Fdf` |
| ESpaceEscrowAdapter    | `0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38` |
| PayFiEscrow            | `0x44898c384Af98dBB3666E0c0dD9dA643547863a6` |
| MockERC20 (demo asset) | `0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca` |


**Example txs:** Approve `0x407e0c9ee6c4a21c3a43e04e93f99993942c5d992970792a87972bfa9ab70dfa` · Core deposit `0x6c3cde5d1adffb3fd983005ff09c0573a436c4f20ee995fa311c274cfa475bf4` · eSpace mapping `0x300c7ec833c0633cebdc0642d5f9ea303c0525c57cfd77f7b15e2adb3de9edea`

**Explorer:** [eSpace testnet](https://evmtestnet.confluxscan.io/) — prefix `/address/<checksum>` for contracts above.

## Features

- Escrow funding, milestone release, refund fallback; API + frontend lifecycle visibility.
- Cross-space PoC: Core deposit → relayer → eSpace escrow.

## Technology Stack

- **Frontend**: Next.js 15, React 19, wagmi, viem, Tailwind CSS 4
- **Backend**: Node.js (Express), viem, PostgreSQL (Neon) / memory fallback
- **Contracts**: Solidity (Foundry)
- **Conflux**: Core + eSpace testnet

## Repository & Demo

- **Main repo**:  [https://github.com/AlphaVeteran/payfidemo/tree/feat/conflux-hackfest-2026](https://github.com/AlphaVeteran/payfidemo/tree/feat/conflux-hackfest-2026)
- **Live demo (Conflux)**: *[[URL 或 TBD]](https://youtu.be/Hx-I4cbZfzg)*
- **Demo video (≤5 min)**: *[YouTube/Vimeo]*
- **Participant intro (30–60 s)**: *[URL]*

## Submission Links

- **Electric Capital open-dev-data PR**: *[链接]*
- **Social post (X)**: *[链接]*

## Known Limitations

- Event-mapping PoC first; full cross-space fund bridging is roadmap. Production needs audit and hardening.

## License

MIT