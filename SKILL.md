---
name: skillmint
description: "Monetize OpenClaw skills with USDC micropayments. Skill creators earn per-call, callers pay automatically. Built on Circle Developer Controlled Wallets + CCTP."
metadata: {"openclaw": {"emoji": "💰", "homepage": "https://github.com/FurryFlasher/skillmint"}}
---

# SkillMint 💰

**Turn your skills into income streams.** SkillMint lets OpenClaw agents monetize their skills with USDC micropayments.

## Why SkillMint?

Agents build amazing skills but have no way to earn from them. SkillMint creates an economic layer:

- **Creators** register skills with per-call pricing
- **Users** pay automatically when invoking paid skills
- **Settlement** happens in USDC via Circle infrastructure
- **Cross-chain** support via CCTP (pay from any chain)

## Quick Start

### For Skill Creators

```bash
# 1. Register your skill for monetization
skillmint register my-awesome-skill --price 0.01

# 2. Get your earnings wallet (auto-created via Circle)
skillmint wallet

# 3. Check your earnings
skillmint earnings
```

### For Skill Users

```bash
# 1. Fund your SkillMint wallet
skillmint fund 10  # Add 10 USDC

# 2. Use paid skills normally - payment is automatic
# When you call a monetized skill, SkillMint handles payment

# 3. Check your usage
skillmint usage
```

## Commands

### Creator Commands
```bash
skillmint register <skill-name> --price <usdc-per-call>  # Register skill for monetization
skillmint update <skill-name> --price <new-price>        # Update pricing
skillmint unregister <skill-name>                         # Remove from monetization
skillmint earnings [--skill <name>]                       # View earnings breakdown
skillmint withdraw [amount] [--to <address>]              # Withdraw earnings
```

### User Commands
```bash
skillmint fund <amount> [--from <address>]    # Add USDC to your balance
skillmint balance                              # Check your SkillMint balance
skillmint usage [--skill <name>]              # View usage history
skillmint estimate <skill-name> [calls]       # Estimate cost for N calls
```

### Admin Commands
```bash
skillmint wallet                    # Show your SkillMint wallet address
skillmint skills                    # List all monetized skills
skillmint skill <name>              # View skill details and stats
```

## How It Works

```
┌─────────────┐      invoke skill      ┌─────────────┐
│  Agent A    │ ───────────────────▶   │  Paid Skill │
│  (User)     │                        │  (Creator)  │
└──────┬──────┘                        └──────┬──────┘
       │                                      │
       │  pay 0.01 USDC                       │  receive 0.01 USDC
       │                                      │
       ▼                                      ▼
┌────────────────────────────────────────────────────┐
│              SkillMint Protocol                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Registry │  │ Metering │  │ Circle Wallets   │ │
│  │ (prices) │  │ (usage)  │  │ (DCW + CCTP)     │ │
│  └──────────┘  └──────────┘  └──────────────────┘ │
└────────────────────────────────────────────────────┘
```

### Payment Flow

1. **User invokes paid skill**
2. **SkillMint checks balance** → sufficient funds?
3. **Deduct from user wallet** (Circle DCW)
4. **Credit to creator wallet** (Circle DCW)
5. **Log usage** for analytics
6. **Execute skill** and return result

### Cross-Chain Support

SkillMint uses Circle's CCTP + Forwarder for cross-chain payments:

- Pay from **any supported chain** (Base, Polygon, Arbitrum, etc.)
- Creator receives on their **preferred chain**
- **Automatic bridging** — no manual claiming

## Pricing Models

### Per-Call (Default)
```bash
skillmint register my-skill --price 0.01  # 0.01 USDC per call
```

### Tiered Pricing (Coming Soon)
```bash
skillmint register my-skill --tier "1-100:0.01,101-1000:0.008,1000+:0.005"
```

### Subscription (Coming Soon)
```bash
skillmint register my-skill --subscription 5 --period month
```

## Economics

| Fee Type | Amount | Recipient |
|----------|--------|-----------|
| Skill Price | Set by creator | Creator (95%) |
| Platform Fee | 5% | SkillMint Treasury |
| Gas | Sponsored | Circle Gas Station |

**Gas-free transactions** via Circle Gas Station — creators and users don't pay gas!

## Example: Monetizing an SEO Skill

```bash
# Creator registers their SEO analysis skill
$ skillmint register seo-analyzer --price 0.05
✓ Registered seo-analyzer at $0.05/call
✓ Wallet created: 0x1234...abcd (ARC-TESTNET)

# User calls the skill (payment automatic)
$ openclaw "analyze SEO for my site"
[SkillMint] Charged 0.05 USDC for seo-analyzer
[seo-analyzer] Your SEO score is 78/100...

# Creator checks earnings
$ skillmint earnings
seo-analyzer: 127 calls = 6.35 USDC (6.03 after fees)
```

## Supported Chains

Leveraging Circle's multi-chain infrastructure:

| Chain | Status | Token |
|-------|--------|-------|
| ARC Testnet | ✅ Default | USDC |
| Base Sepolia | ✅ | USDC |
| Polygon Amoy | ✅ | USDC |
| Arbitrum Sepolia | ✅ | USDC |
| Ethereum Sepolia | ✅ | USDC |

## Security

- **Testnet only** — Do not use mainnet credentials
- **No custody** — Circle manages wallet keys securely
- **Transparent** — All transactions verifiable on-chain
- **Rate limits** — Prevent abuse and runaway costs

## Configuration

Config stored in `~/.openclaw/skillmint/config.json`:

```json
{
  "defaultChain": "ARC-TESTNET",
  "maxPerCall": 1.0,
  "autoFund": false
}
```

## Integration with circle-wallet

SkillMint builds on the `circle-wallet` skill. If you have existing Circle wallets, SkillMint can use them:

```bash
skillmint config --wallet 0x1234...  # Use existing wallet
```

## API (for Skill Developers)

Integrate SkillMint into your skill:

```javascript
// In your skill's code
const skillmint = require('skillmint');

// Check if caller has sufficient balance
const canPay = await skillmint.checkBalance(callerId, 0.05);

// Charge for the call
await skillmint.charge(callerId, skillName, 0.05);
```

## Roadmap

- [x] Basic per-call payments
- [x] Circle DCW integration
- [ ] CCTP cross-chain payments
- [ ] Subscription model
- [ ] Usage analytics dashboard
- [ ] ClawHub marketplace integration

## Built With

- **Circle Developer Controlled Wallets** — Programmatic wallet management
- **Circle CCTP** — Cross-chain USDC transfers
- **Circle Forwarder** — Automatic destination chain minting
- **Circle Gas Station** — Sponsored gas fees

## License

MIT

---

**SkillMint** — Built by FurryFlasher for the USDC Hackathon 🚀

*Making agent skills economically viable, one micropayment at a time.*
