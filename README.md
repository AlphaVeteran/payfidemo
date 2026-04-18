# PayFi Cross-border Escrow Demo

English | [中文](README.zh.md)

End-to-end cross-border e-commerce PayFi demo for escrow-based settlement and milestone disbursement.

## Project Introduction

**PayFi Cross-border Escrow Demo** is an end-to-end project that models a cross-border e-commerce payment workflow: buyer payment intent, on-chain escrow deposit, milestone-based release, and refund fallback.  
Key capabilities include token approval and escrow deposit, platform-governed milestone disbursement, automatic refund of remaining funds at maturity, and gateway/webhook verification mechanisms.  
It is designed for hackathon demos, proof-of-concept validation, and rapid prototyping of programmable cross-border settlement products.

## Overview

The demo maps to a cross-border commerce lifecycle:

- Buyer authorizes tokens and deposits funds into escrow.
- Seller delivers by milestones and receives staged releases.
- Platform policy controls release/refund execution.
- Remaining balance is automatically refunded on maturity.
- Gateway/webhook verification is used for payment integrity.

## Core Features

- Cross-border order escrow with on-chain settlement flow.
- Milestone-based disbursement for staged fulfillment.
- Platform-governed release and refund controls.
- Automatic residual refund at term end.
- Local validation flow for HashKey Gateway + HSP dual-source verification.

## Demo

- Demo Video(HashKey Chain Horizon Hackathon) : [https://youtu.be/n32dgEcimV8](https://youtu.be/n32dgEcimV8)
- Live Demo (Hashkey Chain Testnet, ChainID: 133)  [https://payfidemo-frontend-hashkey-qa.up.railway.app/](https://payfidemo-frontend-hashkey-qa.up.railway.app)
- Live Demo (Base Sepolia, ChainID: 84532). [https://payfidemo-frontend-base-sepolia.up.railway.app/](https://payfidemo-frontend-base-sepolia.up.railway.app/)

### Railway Public Environment Status (HashKey Testnet)

- The public Railway deployment can demonstrate core on-chain flow: token approval + escrow deposit, dual-signature installment release, and automatic residual refund on maturity.
- HashKey Gateway checkout capability may be blocked by Cloudflare/Bot protection in public Railway (`payment_url` may be empty).
- HashKey Gateway checkout + HSP/gateway dual-source verification has been validated in local environment (see demo recording).

---

## Conflux Hackfest 2026 (Under construction...)

### Narrative

This project targets the cross-border e-commerce trust gap:

- Buyers want delivery guarantees before full release of funds.
- Sellers want payment certainty once milestones are met.
- Platforms need transparent, auditable settlement policies.

Paying in **RMB** is often hard for buyers: overseas sellers frequently settle in foreign currency; limited direct RMB rails push buyers toward intermediaries with **opaque FX and fees**, **slower settlement**, and **weak alignment** between payment timing and delivery or disputes across jurisdictions.

**Solution pillars:** (1) **Compliance layering** — onshore funds stay onshore; offshore settlement completes on **eSpace**, with onshore intent on **Core**. (2) **No custodial risk** — margin is locked in **contracts**; neither side can unilaterally take funds. (3) **Conflux-native** — **gas sponsorship** lowers user friction; **Core + eSpace** separates onshore/offshore logic by design.

By combining escrow, milestone release, and refund fallback, the demo shows a practical PayFi pattern suitable for cross-border commerce on EVM-compatible infrastructure.

### Roadmap

**Cross-Space PoC Validation (Core -> eSpace)**

Demo narrative (roadshow): a **Shanghai buyer** imports goods from a **Hong Kong seller** and uses programmable escrow to reduce trust and settlement friction in cross-border commerce.

Implementation is split into two phases:

1. **Phase 1 (roadshow committed)**: event-mapping closed loop (`Core order event -> eSpace escrow mapping -> release/refund flow`).
2. **Phase 2 (post-demo upgrade)**: real cross-space fund movement with proof-based settlement consistency.

We successfully validated the Phase 1 end-to-end flow from Core-side order deposit event to escrow execution on eSpace:

1. Buyer approves token and deposits order in `CoreOrderVault`;
2. Relayer listens to Core `OrderDeposited` and calls `createEscrowFromCore` on eSpace;
3. Adapter registers the escrow in `PayFiEscrow` and emits a mapped `escrowId`.

> Scope note: current PoC prioritizes the event-mapping business loop for demo reliability. Real fund bridging is tracked as the next milestone.

**On-chain evidence (eSpace testnet / chainId 71)**

- Core Space testnet uses `chainId = 1` in Conflux Core (this is not Ethereum mainnet `chainId = 1`).
- Approve Tx: `0x407e0c9ee6c4a21c3a43e04e93f99993942c5d992970792a87972bfa9ab70dfa`
- Core order deposit Tx: `0x6c3cde5d1adffb3fd983005ff09c0573a436c4f20ee995fa311c274cfa475bf4`
- eSpace mapping Tx: `0x300c7ec833c0633cebdc0642d5f9ea303c0525c57cfd77f7b15e2adb3de9edea`
- coreOrderId: `1776175312179`
- escrowId: `10429080304411244359614541526982370061373641461870929980440368445856475775012`

**Deployed contracts**

- CoreOrderVault: `0xAe26E03F8C0E7c8B0ACe8dc8B825A498f8925Fdf`
- ESpaceEscrowAdapter: `0x8d7d93043768f863DcCAbD0B9c4189222fFc1d38`
- PayFiEscrow: `0x44898c384Af98dBB3666E0c0dD9dA643547863a6`
- MockERC20 (demo asset): `0x680E3dbf8fDBb8518969F0d4b1DC4ae9b55685ca`

### Hackfest Submission Doc

- Full submission draft: [docs/hackfest-2026-submission.md](docs/hackfest-2026-submission.md)
- README to copy into `global-hackfest-2026/projects/<name>/`: [docs/hackfest-2026-projects-readme.md](docs/hackfest-2026-projects-readme.md)

---

## Quick Start

- Read system architecture and stack: [docs/system-architecture-stack.md](docs/system-architecture-stack.md)
- Read escrow architecture details: [docs/payfi-escrow-architecture.md](docs/payfi-escrow-architecture.md)
- Open interactive architecture view: [docs/payfidemo_architecture_overview_en.html](docs/payfidemo_architecture_overview_en.html)

## License

MIT