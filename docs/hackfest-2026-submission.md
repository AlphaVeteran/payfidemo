# PayFi Cross-border Escrow on Conflux

Milestone-based escrow payment rails for cross-border e-commerce.

License: MIT  
Conflux Hackathon Submission

## Overview

PayFi Cross-border Escrow is a practical payment workflow for international commerce:
buyers lock funds in escrow, sellers receive milestone-based releases, and unresolved orders can be refunded by policy.

This project is built from the `payfidemo` codebase and adapted into a cross-border e-commerce narrative for Global Hackfest 2026.

## Hackathon Information

- **Event**: Global Hackfest 2026
- **Focus Area**: Open Innovation (DeFi / Payments)
- **Team**: [Fill your team name]
- **Submission Date**: 2026-04-20

## Team

| Name | Role | GitHub | Discord |
| --- | --- | --- | --- |
| [Your Name] | Builder / Full-stack | [@your-github](https://github.com/your-github) | [your-discord] |

## Problem Statement

Cross-border e-commerce faces a trust and settlement gap:

- Buyers worry about paying before delivery.
- Sellers worry about delayed or denied payment.
- Platforms need transparent and auditable release rules.

Traditional payment systems do not natively support programmable, milestone-based settlement with on-chain auditability.

## Solution

We implement a milestone escrow flow:

1. Buyer creates a payment intent and funds escrow with USDC.
2. Seller completes staged fulfillment.
3. Platform and signer policy trigger milestone release.
4. Remaining funds can be refunded if conditions are not met by maturity.

This improves trust, reduces settlement ambiguity, and makes payment state transitions verifiable.

## Go-to-Market Plan

### Target users

- Cross-border SMB merchants
- Freelancers and export service providers
- Marketplace platforms requiring conditional payout logic

### Distribution strategy

- Launch with a hosted demo for onboarding
- Integrate via simple API-first pattern for merchant checkout flows
- Collaborate with merchant and builder communities in the Conflux ecosystem

### Metrics

- Number of intents created
- Escrow volume
- Settlement completion rate
- Average time from funding to release

### Ecosystem fit

The project provides a Conflux-ready payment middleware pattern for programmable commerce settlement.

## Conflux Integration

- **eSpace**: escrow contract lifecycle (funding, release, refund) executes on Conflux eSpace testnet.
- **EVM compatibility**: Solidity contract and standard wallet tooling are used.
- **On-chain verification**: each critical payment action can be traced by transaction hash in the explorer.

Current MVP focuses on the eSpace path for hackathon scope and delivery speed.

## Features

### Core features

- Escrow-based fund locking for order intents
- Milestone-based staged disbursement
- Refund fallback for expired or unresolved intents
- API plus frontend status visibility for payment lifecycle

### Planned roadmap

- Dispute arbitration module
- Logistics-aware milestone automation
- Merchant dashboard and settlement analytics

## Technology Stack

- **Frontend**: Next.js
- **Backend**: Node.js REST API
- **Database**: PostgreSQL (Neon)
- **Smart contracts**: Solidity
- **Network**: Conflux eSpace testnet

## Architecture

Frontend (checkout + status tracking)  
<-> Backend API (intent lifecycle + verification + release orchestration)  
<-> Escrow smart contract on Conflux eSpace (funding/release/refund)

## Installation and Setup

- Main repository: [https://github.com/your-org/payfidemo](https://github.com/your-org/payfidemo)
- Follow root `README.md` for environment configuration and startup.
- Use the Conflux/HashKey testnet environment profile to run the full flow.

## Demo

- **Live demo**: [Fill deployment URL]
- **Demo video (3-5 min)**: [Fill YouTube URL]
- **Participant intro video (30-60 sec)**: [Fill intro video URL]

## Smart Contracts

- **Escrow contract (Conflux eSpace testnet)**: `0x...`
- **Explorer**: [https://evmtestnet.confluxscan.io/address/0x...](https://evmtestnet.confluxscan.io/address/0x...)

## Submission Links

- **Main repo**: [https://github.com/your-org/payfidemo](https://github.com/your-org/payfidemo)
- **Project entry in hackathon repo**: [Fill PR link]
- **Open Dev Data PR**: [Fill PR link]
- **Submission issue**: [Fill issue link]
- **Tweet / social post**: [Fill post link]

## Known Limitations

- Dispute handling is simplified for MVP scope.
- Production readiness requires additional hardening and security review.

## License

MIT
