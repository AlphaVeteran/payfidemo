# PayFi Cross-border Escrow Demo

Milestone-based escrow for cross-border e-commerce: buyer funds escrow, staged seller releases, refund fallback by policy.

License: MIT · Global Hackfest 2026

> **Usage:** Copy this file to your fork of [global-hackfest-2026](https://github.com/conflux-fans/global-hackfest-2026) as `projects/<kebab-case-name>/README.md`, then open a PR. Keep in sync with [hackfest-2026-submission.md](./hackfest-2026-submission.md).

## Overview

PayFi Cross-border Escrow Demo models a cross-border e-commerce payment flow: payment intent, on-chain escrow, milestone disbursement, and refund at maturity, with gateway/webhook verification patterns suitable for PayFi prototypes.

## Hackathon Information

- **Event**: Global Hackfest 2026
- **Focus Area**: Open Innovation (Payments / StableCoin Integration)
- **Team**: *AlphaVeteran*
- **Submission Date**: 2026-04-20 @ 11:59:59

## Team


| Name     | Role        | GitHub                                    | Discord        |
| -------- | ----------- | ----------------------------------------- | -------------- |
| *Ada*    | *Architect* | *[@AlphaVeteran](https://github.com/AlphaVeteran)* | ++alphaoldie++ |
| *Yixing* | *Developer* | *[@SauTi9138](https://github.com/SauTi9138)*      | *[Discord]*    |


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

- **Main repo**: *[公开 GitHub URL]*
- **Live demo (Conflux)**: *[URL 或 TBD]*
- **Demo video (≤5 min)**: *[YouTube/Vimeo]*
- **Participant intro (30–60 s)**: *[URL]*

## Submission Links

- **Electric Capital open-dev-data PR**: *[链接]*
- **Social post (X)**: *[链接]*

## Known Limitations

- Event-mapping PoC first; full cross-space fund bridging is roadmap. Production needs audit and hardening.

## License

MIT