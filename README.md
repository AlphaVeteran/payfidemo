# PayFi Demo

English | [中文](README.zh.md)

End-to-end PayFi demo for escrow-based payments and milestone disbursement.

## Project Introduction

**PayFi Demo** is an end-to-end project that demonstrates a PayFi (Payment Finance) workflow, from payment initiation to on-chain escrow and milestone-based disbursement.  
Key capabilities include token approval and escrow deposit, dual-signature installment release, automatic refund of remaining funds at maturity, and gateway/webhook verification mechanisms.  
It is designed for hackathon demos, proof-of-concept validation, and rapid prototyping of PayFi products.

## Overview

PayFi Demo demonstrates a full payment-finance flow:

- User authorizes tokens and deposits funds into escrow.
- Merchant and platform co-sign installment releases.
- Remaining balance is automatically refunded on maturity.
- Gateway/webhook verification is used for payment integrity.

## Core Features

- Escrow-based on-chain settlement flow.
- Dual-signature milestone disbursement.
- Automatic residual refund at term end.
- Local validation flow for HashKey Gateway + HSP dual-source verification.

## Demo

- Demo Video : [https://youtu.be/n32dgEcimV8](https://youtu.be/n32dgEcimV8)
- Live Demo (Hashkey Chain Testnet, ChainID: 133)  [https://payfidemo-frontend-hashkey-qa.up.railway.app/](https://payfidemo-frontend-hashkey-qa.up.railway.app)
- Live Demo (Base Sepolia, ChainID: 84532). [https://payfidemo-frontend-base-sepolia.up.railway.app/](https://payfidemo-frontend-base-sepolia.up.railway.app/)

### Railway Public Environment Status (HashKey Testnet)

- The public Railway deployment can demonstrate core on-chain flow: token approval + escrow deposit, dual-signature installment release, and automatic residual refund on maturity.
- HashKey Gateway checkout capability may be blocked by Cloudflare/Bot protection in public Railway (`payment_url` may be empty).
- HashKey Gateway checkout + HSP/gateway dual-source verification has been validated in local environment (see demo recording).

## Quick Start

- Read system architecture and stack: [docs/system-architecture-stack.md](docs/system-architecture-stack.md)
- Read escrow architecture details: [docs/payfi-escrow-architecture.md](docs/payfi-escrow-architecture.md)
- Open interactive architecture view: [docs/payfidemo_architecture_overview_en.html](docs/payfidemo_architecture_overview_en.html)

## License

MIT