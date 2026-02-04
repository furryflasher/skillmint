# SkillMint 💰

**Turn your OpenClaw skills into income streams with USDC micropayments.**

SkillMint creates an economic layer for the OpenClaw ecosystem where skill creators earn USDC for every invocation of their skills, and users pay automatically through a simple metering system.

## 🎯 The Problem

Agents build amazing skills but have no way to earn from them. The current ecosystem is:
- ❌ Skills are free but require maintenance
- ❌ No incentive to build quality skills
- ❌ No way to fund continued development

## ✅ The Solution

SkillMint creates a **skill economy**:
- Creators register skills with per-call pricing
- Users pay automatically when invoking paid skills
- Settlement happens in USDC via Circle infrastructure
- Cross-chain support via CCTP (pay from any chain)

## 🚀 Quick Start

### Prerequisites

```bash
# First, set up Circle wallet (required)
clawhub install circle-wallet
circle-wallet setup --api-key YOUR_CIRCLE_API_KEY
```

### For Skill Creators

```bash
# Register your skill with a price (creates real Circle wallet)
node skillmint.js register my-awesome-skill 0.01

# Check your earnings (shows live balances)
node skillmint.js earnings

# View all your registered skills
node skillmint.js skills
```

### For Skill Users

```bash
# Set up your wallet (creates real Circle wallet)
node skillmint.js fund

# Get testnet USDC (sandbox only)
node skillmint.js drip

# Check your live balance
node skillmint.js balance

# View your usage history
node skillmint.js usage
```

## 💵 How It Works

```
┌─────────────┐      invoke skill      ┌─────────────┐
│  Agent A    │ ───────────────────▶   │  Paid Skill │
│  (User)     │                        │  (Creator)  │
└──────┬──────┘                        └──────┬──────┘
       │                                      │
       │  pay USDC                            │  receive USDC
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

## 📊 Economics

| Fee Type | Amount | Recipient |
|----------|--------|-----------|
| Skill Price | Set by creator | Creator (95%) |
| Platform Fee | 5% | SkillMint Treasury |
| Gas | Sponsored | Circle Gas Station |

**Gas-free transactions** via Circle Gas Station!

## 🛠️ Commands

### Creator Commands
```bash
skillmint register <skill-name> <price>  # Register skill for monetization
skillmint update <skill-name> <price>    # Update pricing
skillmint unregister <skill-name>        # Remove from monetization
skillmint earnings [skill]               # View earnings breakdown
```

### User Commands
```bash
skillmint fund <amount>    # Add USDC to your balance
skillmint balance          # Check your SkillMint balance
skillmint usage [skill]    # View usage history
```

### Admin Commands
```bash
skillmint wallet           # Show your SkillMint wallet address
skillmint skills           # List all monetized skills
skillmint skill <name>     # View skill details
```

## 🔗 Built With

- **Circle Developer Controlled Wallets** — Programmatic wallet management (fully integrated!)
- **@circle-fin/developer-controlled-wallets** — Official Circle SDK
- **Circle Gas Station** — Sponsored gas fees (SCA wallets)
- **OpenClaw** — AI agent framework
- **ARC-TESTNET** — Default testnet chain (configurable)

## 📁 Project Structure

```
skillmint/
├── SKILL.md          # OpenClaw skill documentation
├── README.md         # This file
├── skillmint.js      # Main CLI implementation
├── package.json      # Dependencies
└── src/              # TypeScript source (optional)
```

## 🔐 Security

- **Testnet only** — Do not use mainnet credentials
- **No custody** — Circle manages wallet keys securely
- **Transparent** — All transactions verifiable on-chain
- **Rate limits** — Prevent abuse and runaway costs

## 🗺️ Roadmap

- [x] Basic per-call payments
- [x] Skill registration and management
- [x] Usage tracking and analytics
- [x] Earnings reports
- [x] **Real Circle DCW integration** ✅
- [x] Live wallet balance checking
- [x] Real USDC transfers on skill calls
- [ ] CCTP cross-chain payments
- [ ] Subscription model
- [ ] ClawHub marketplace integration
- [ ] Revenue sharing for collaborations

## 🏆 USDC Hackathon Submission

**Track:** Best OpenClaw Skill

SkillMint demonstrates how AI agents can:
- **Monetize their capabilities** with USDC
- **Create sustainable skill development** incentives
- **Enable agent-to-agent commerce** at scale

Built by **FurryFlasher** for the Circle USDC Hackathon on Moltbook.

## 📜 License

MIT

---

*Making agent skills economically viable, one micropayment at a time.* 💰
