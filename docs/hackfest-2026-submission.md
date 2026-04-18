# PayFi Cross-border Escrow Demo (Conflux)

Milestone-based escrow for cross-border e-commerce: buyer funds escrow, staged seller releases, refund fallback by policy.

**License:** MIT · **Submission:** Global Hackfest 2026

## Overview

**PayFi Cross-border Escrow Demo** models a cross-border e-commerce payment flow: payment intent, on-chain escrow, milestone disbursement, and refund at maturity, with gateway/webhook verification patterns suitable for PayFi prototypes.

This document is built from the `payfidemo` codebase and aligned with the [hackathon projects README template](https://github.com/conflux-fans/global-hackfest-2026/tree/main/projects).

## Hackathon Information

- **Event**: Global Hackfest 2026
- **Focus Area**: Open Innovation (DeFi / Payments)
- **Team**: _[填写队名]_
- **Submission deadline**: 2026-04-20 @ 11:59:59 (see [Submission Guide](https://confluxglobal.notion.site/Submission-Guide-2ea8676399698000b70cf94bf275203f))

## Team

| Name | Role | GitHub | Discord |
| --- | --- | --- | --- |
| _[姓名]_ | _[角色]_ | _[@用户名](https://github.com/用户名)_ | _[Discord]_ |

## Problem Statement

Cross-border e-commerce has a trust and settlement gap:

- Buyers want delivery guarantees before full release of funds.
- Sellers want payment certainty once milestones are met.
- Platforms need transparent, auditable settlement policies.

**Paying in RMB (人民币)** adds friction for buyers in many cross-border scenarios: overseas sellers often price and settle in foreign currency; direct RMB acceptance is limited, so buyers rely on card networks, aggregators, or informal channels—leading to **higher fees, slower settlement, opaque FX**, and **weaker alignment** between payment timing and delivery or dispute resolution across jurisdictions.

Traditional payment rails rarely offer programmable milestone settlement with on-chain auditability.

## Solution

**Design principles**

1. **Compliance layering** — **Onshore funds do not leave the jurisdiction** in the intended architecture: the onshore leg records intent and commitment on **Core Space**; **offshore settlement and escrow execution complete on eSpace**, keeping regulatory and settlement concerns separable. (Current PoC proves the **business loop** with event mapping; full fund-flow separation is the production extension.)
2. **No custodial risk** — **Margin is locked in smart contracts**; neither buyer nor seller can unilaterally withdraw. Release and refund follow on-chain rules and policy-controlled signers, not platform custody of user balances.
3. **Conflux-native leverage** — **Gas sponsorship** on Conflux lowers friction for end users who are new to on-chain checkout. **Dual-space architecture (Core + eSpace)** naturally **separates onshore vs offshore logic** while still allowing a coherent end-to-end demo.

**Flow**

We implement a milestone escrow flow:

1. Buyer authorizes tokens and deposits (Core: order vault; eSpace: escrow execution in the PoC).
2. Seller completes staged fulfillment; platform and signer policy trigger milestone release.
3. Remaining funds can be refunded by maturity/policy.
4. A relayer listens to Core `OrderDeposited` and calls `createEscrowFromCore` on eSpace so the **cross-space business loop** is demonstrable (Phase 1: event mapping; real fund bridging is tracked as a follow-up).

This improves trust, reduces settlement ambiguity, and makes payment state transitions verifiable.

## Go-to-Market Plan

### Phase 1 — First month

Turn the **demo-grade** product into an **open tool** that **external users can adopt independently**. **Seed users:** **3–5** organizations, prioritized from **cross-border traders engaged at relevant events** and **Web3-native payment teams**.

### Phase 2 — Two months

Shift from **technical demo** to **commercial PoC**. **Targets:** sign **1–2 MOUs**; select a **real trade route** (e.g. **Shanghai → Southeast Asia** or **Hong Kong → Belt & Road**) as the validation scenario. **Ship a TypeScript SDK** so external developers can self-serve integration. **Acceptance criterion:** **three** external developers complete integration **without assistance**.

### Phase 3 — Three months

**Scale validation.** Complete the **first real AxCNH cross-border settlement on mainnet**, preserve **on-chain evidence**, and produce an **investor-ready** “real funds have moved” case. **In parallel:** content marketing with a goal of **one** major media placement (**PANews** or **The Block**) to establish the brand narrative.

### Ecosystem fit

Positions the stack as Conflux-native programmable settlement (Core + eSpace) with a credible path from demo → PoC → mainnet proof and developer distribution (SDK).

## Conflux Integration

- **Core Space**: `CoreOrderVault` — buyer order deposit; `OrderDeposited` events consumed by the relayer. Core testnet uses Conflux Core `chainId = 1` (this is **not** Ethereum mainnet `chainId = 1`).
- **eSpace**: `PayFiEscrow`, `ESpaceEscrowAdapter` — escrow lifecycle; `createEscrowFromCore` after Core events. **eSpace testnet** EVM `chainId` **71**.
- **Cross-Space**: PoC validates **Core order event → eSpace escrow mapping → release/refund flow**. Scope note: the PoC prioritizes the event-mapping loop for demo reliability; real cross-space fund movement is roadmap.
- **Gas sponsorship**: Conflux-native sponsorship reduces friction for users new to on-chain checkout (enable where available in deployment).
- **On-chain verification**: critical actions traceable via transaction hash on ConfluxScan.

### Partner integrations

- _[e.g. Privy / Pyth / LayerZero if used — otherwise “N/A for this PoC”]_

## Features

### Core features

- Escrow-based fund locking for order intents
- Milestone-based staged disbursement
- Refund fallback for expired or unresolved intents
- API plus frontend status visibility for payment lifecycle
- Cross-space PoC: Core deposit → relayer → eSpace escrow mapping

### Planned roadmap

- Dispute arbitration module
- Logistics-aware milestone automation
- Merchant dashboard and settlement analytics
- Full cross-space fund bridging with proof-based consistency

## Technology Stack

- **Frontend**: Next.js 15, React 19, wagmi, viem, Tailwind CSS 4
- **Backend**: Node.js (Express), viem, PostgreSQL (Neon) with in-memory fallback when unset
- **Smart contracts**: Solidity (Foundry in repo)
- **Network**: Conflux Core testnet + Conflux eSpace testnet (cross-space PoC)

## Architecture

High level: **Frontend** (checkout + status) ↔ **REST API** (intents, webhooks, settlement orchestration) ↔ **contracts** on Conflux (Core + eSpace). Detail: [system-architecture-stack.md](./system-architecture-stack.md), [payfi-escrow-architecture.md](./payfi-escrow-architecture.md), interactive [payfidemo_architecture_overview_en.html](./payfidemo_architecture_overview_en.html).

## Installation and Setup

- **Main repository**: _[公开 GitHub URL，例如 https://github.com/<org>/payfidemo]_
- Follow root `README.md` and [cross-space-intent-test-guide.zh.md](./cross-space-intent-test-guide.zh.md) for Conflux testnet flows.
- Scripts: `npm run dev:conflux-testnet`, `npm run relayer:core-to-espace` (see `package.json`).

## Demo

- **Live demo (Conflux)**: _[填写可访问的 Conflux 部署 URL；暂无则写 “TBD” 并注明仅本地/文档流程]_
- **Other demos (from root README, non-Conflux chains)**: HashKey / Base Sepolia links may exist for parallel demos — prefer Conflux URL for hackathon judges.
- **Demo video (≤5 min)**: _[YouTube / Vimeo URL]_
- **Participant intro video (30–60 s, required)**: _[URL]_

## Smart contracts & on-chain evidence (testnet)

_Re-verify on ConfluxScan before submission._

### Deployed contracts

| Contract | Address | Explorer (eSpace testnet) |
| --- | --- | --- |
| CoreOrderVault | `0xAe26E03F8C0E7c8B0ACe8dc8B825A498f8925Fdf` | [Core Space testnet](https://testnet.confluxscan.io/address/0xae26e03f8c0e7c8b0ace8dc8b825a498f8925fdf) |
| ESpaceEscrowAdapter | `0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38` | [eSpace](https://evmtestnet.confluxscan.io/address/0x8d7d93043768f863dccabd0b9c4189222ffc1d38) |
| PayFiEscrow | `0x44898c384Af98dBB3666E0c0dD9dA643547863a6` | [eSpace](https://evmtestnet.confluxscan.io/address/0x44898c384af98dbb3666e0c0dd9da643547863a6) |
| MockERC20 (demo asset) | `0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca` | [eSpace](https://evmtestnet.confluxscan.io/address/0x680e3dbf8fdbb8518969f0d4b1dc4ae9b55685ca) |

### Example transactions (from project README — re-verify)

- Approve: `0x407e0c9ee6c4a21c3a43e04e93f99993942c5d992970792a87972bfa9ab70dfa`
- Core order deposit: `0x6c3cde5d1adffb3fd983005ff09c0573a436c4f20ee995fa311c274cfa475bf4`
- eSpace mapping: `0x300c7ec833c0633cebdc0642d5f9ea303c0525c57cfd77f7b15e2adb3de9edea`

### Example mapping IDs (demo run)

- `coreOrderId`: `1776175312179`
- `escrowId`: `10429080304411244359614541526982370061373641461870929980440368445856475775012`

## Submission Links

- **Main repo**: _[同上公开 URL]_
- **Hackathon `projects/` PR** (global-hackfest-2026): _[PR 链接]_
- **Electric Capital [open-dev-data](https://github.com/electric-capital/open-dev-data) PR**: _[PR 链接]_
- **Social post** (X: @ConfluxDevs @ConfluxNetwork #ConfluxHackathon #globalhackfest26): _[帖子链接]_
- **Grant forum post** (optional bonus): _[论坛链接]_

## Known Limitations

- Cross-space PoC emphasizes event mapping; full fund bridging is not the current milestone.
- Dispute handling is simplified for MVP; production requires security review and hardening.

## Related docs in this repo

- Copy-paste README for forked `projects/<name>/`: [hackfest-2026-projects-readme.md](./hackfest-2026-projects-readme.md)

## License

MIT
