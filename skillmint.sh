#!/bin/bash
# SkillMint - Monetize OpenClaw skills with USDC micropayments
# Built on Circle Developer Controlled Wallets

set -e

CONFIG_DIR="${HOME}/.openclaw/skillmint"
REGISTRY_FILE="${CONFIG_DIR}/registry.json"
USAGE_FILE="${CONFIG_DIR}/usage.json"
USER_WALLET_FILE="${CONFIG_DIR}/user-wallet.json"
CIRCLE_CONFIG="${HOME}/.openclaw/circle-wallet/config.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize config directory
init_config() {
    mkdir -p "${CONFIG_DIR}"
    if [ ! -f "${REGISTRY_FILE}" ]; then
        echo '{"skills":[]}' > "${REGISTRY_FILE}"
    fi
    if [ ! -f "${USAGE_FILE}" ]; then
        echo '{"entries":[]}' > "${USAGE_FILE}"
    fi
}

# Check if circle-wallet is configured
check_circle_config() {
    if [ ! -f "${CIRCLE_CONFIG}" ]; then
        echo -e "${RED}Error: Circle wallet not configured.${NC}"
        echo "Run: circle-wallet setup --api-key <your-key>"
        exit 1
    fi
}

# Load Circle config
load_circle_config() {
    if [ -f "${CIRCLE_CONFIG}" ]; then
        CIRCLE_API_KEY=$(jq -r '.apiKey' "${CIRCLE_CONFIG}")
        CIRCLE_ENV=$(jq -r '.env' "${CIRCLE_CONFIG}")
        DEFAULT_CHAIN=$(jq -r '.defaultChain' "${CIRCLE_CONFIG}")
        WALLET_SET_ID=$(jq -r '.walletSetId' "${CIRCLE_CONFIG}")
    fi
}

# Register a skill for monetization
cmd_register() {
    local skill_name="$1"
    local price="$2"
    local chain="${3:-${DEFAULT_CHAIN:-ARC-TESTNET}}"
    
    if [ -z "$skill_name" ] || [ -z "$price" ]; then
        echo -e "${RED}Usage: skillmint register <skill-name> <price>${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Registering ${skill_name} at \$${price}/call...${NC}"
    
    # Check if already registered
    if jq -e ".skills[] | select(.name == \"${skill_name}\")" "${REGISTRY_FILE}" > /dev/null 2>&1; then
        echo -e "${RED}Error: Skill '${skill_name}' is already registered${NC}"
        exit 1
    fi
    
    # Generate a wallet address (mock for demo)
    local wallet_address="0x$(openssl rand -hex 20)"
    local wallet_id="skillmint-$(uuidgen | tr '[:upper:]' '[:lower:]')"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Add to registry
    local new_skill=$(cat <<EOF
{
    "name": "${skill_name}",
    "price": ${price},
    "chain": "${chain}",
    "walletAddress": "${wallet_address}",
    "walletId": "${wallet_id}",
    "createdAt": "${timestamp}",
    "totalCalls": 0,
    "totalEarnings": 0
}
EOF
)
    
    jq ".skills += [${new_skill}]" "${REGISTRY_FILE}" > "${REGISTRY_FILE}.tmp" && mv "${REGISTRY_FILE}.tmp" "${REGISTRY_FILE}"
    
    echo -e "${GREEN}✓ Registered ${skill_name} at \$${price}/call${NC}"
    echo -e "${GREEN}✓ Payout wallet: ${wallet_address} (${chain})${NC}"
}

# Unregister a skill
cmd_unregister() {
    local skill_name="$1"
    
    if [ -z "$skill_name" ]; then
        echo -e "${RED}Usage: skillmint unregister <skill-name>${NC}"
        exit 1
    fi
    
    jq "del(.skills[] | select(.name == \"${skill_name}\"))" "${REGISTRY_FILE}" > "${REGISTRY_FILE}.tmp" && mv "${REGISTRY_FILE}.tmp" "${REGISTRY_FILE}"
    
    echo -e "${GREEN}✓ Unregistered ${skill_name}${NC}"
}

# Update skill pricing
cmd_update() {
    local skill_name="$1"
    local price="$2"
    
    if [ -z "$skill_name" ] || [ -z "$price" ]; then
        echo -e "${RED}Usage: skillmint update <skill-name> <new-price>${NC}"
        exit 1
    fi
    
    jq "(.skills[] | select(.name == \"${skill_name}\")).price = ${price}" "${REGISTRY_FILE}" > "${REGISTRY_FILE}.tmp" && mv "${REGISTRY_FILE}.tmp" "${REGISTRY_FILE}"
    
    echo -e "${GREEN}✓ Updated ${skill_name} to \$${price}/call${NC}"
}

# View earnings
cmd_earnings() {
    local skill_filter="$1"
    
    echo -e "${BLUE}\n📊 Earnings Report\n${NC}"
    
    local skills
    if [ -n "$skill_filter" ]; then
        skills=$(jq -c ".skills[] | select(.name == \"${skill_filter}\")" "${REGISTRY_FILE}")
    else
        skills=$(jq -c '.skills[]' "${REGISTRY_FILE}")
    fi
    
    if [ -z "$skills" ]; then
        echo -e "${YELLOW}No monetized skills found.${NC}"
        return
    fi
    
    local total_earnings=0
    
    echo "$skills" | while read -r skill; do
        local name=$(echo "$skill" | jq -r '.name')
        local calls=$(echo "$skill" | jq -r '.totalCalls')
        local gross=$(echo "$skill" | jq -r '.totalEarnings')
        local net=$(echo "$gross * 0.95" | bc)
        local wallet=$(echo "$skill" | jq -r '.walletAddress')
        
        echo -e "${GREEN}${name}${NC}"
        echo "  Calls: ${calls}"
        echo "  Gross: ${gross} USDC"
        echo "  Net (95%): ${net} USDC"
        echo "  Wallet: ${wallet}"
        echo ""
    done
}

# List all monetized skills
cmd_skills() {
    echo -e "${BLUE}\n🛠️  Monetized Skills\n${NC}"
    
    local count=$(jq '.skills | length' "${REGISTRY_FILE}")
    
    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No monetized skills registered yet.${NC}"
        return
    fi
    
    printf "%-25s %-12s %-10s %s\n" "Name" "Price" "Calls" "Earnings"
    printf "%s\n" "------------------------------------------------------------"
    
    jq -r '.skills[] | "\(.name)|\(.price)|\(.totalCalls)|\(.totalEarnings)"' "${REGISTRY_FILE}" | while IFS='|' read -r name price calls earnings; do
        printf "%-25s \$%-11.4f %-10s \$%.4f\n" "$name" "$price" "$calls" "$earnings"
    done
}

# View skill details
cmd_skill() {
    local skill_name="$1"
    
    if [ -z "$skill_name" ]; then
        echo -e "${RED}Usage: skillmint skill <name>${NC}"
        exit 1
    fi
    
    local skill=$(jq ".skills[] | select(.name == \"${skill_name}\")" "${REGISTRY_FILE}")
    
    if [ -z "$skill" ] || [ "$skill" = "null" ]; then
        echo -e "${YELLOW}Skill '${skill_name}' not found.${NC}"
        return
    fi
    
    echo -e "${BLUE}\n🔍 Skill: ${skill_name}\n${NC}"
    echo "Price: \$$(echo "$skill" | jq -r '.price')/call"
    echo "Chain: $(echo "$skill" | jq -r '.chain')"
    echo "Wallet: $(echo "$skill" | jq -r '.walletAddress')"
    echo "Total Calls: $(echo "$skill" | jq -r '.totalCalls')"
    echo "Total Earnings: \$$(echo "$skill" | jq -r '.totalEarnings')"
    echo "Registered: $(echo "$skill" | jq -r '.createdAt')"
}

# Check balance
cmd_balance() {
    echo -e "${BLUE}\n💰 SkillMint Balance\n${NC}"
    
    if [ -f "${USER_WALLET_FILE}" ]; then
        local wallet=$(cat "${USER_WALLET_FILE}")
        echo "Wallet: $(echo "$wallet" | jq -r '.address')"
        echo "Chain: $(echo "$wallet" | jq -r '.chain')"
        echo -e "Balance: ${GREEN}100.00 USDC${NC} (demo)"
    else
        echo -e "${YELLOW}No wallet configured yet. Run: skillmint fund <amount>${NC}"
    fi
}

# Fund account
cmd_fund() {
    local amount="$1"
    
    echo -e "${BLUE}Setting up SkillMint wallet...${NC}"
    
    # Create user wallet if doesn't exist
    if [ ! -f "${USER_WALLET_FILE}" ]; then
        local wallet_address="0x$(openssl rand -hex 20)"
        local wallet_id="skillmint-user-$(uuidgen | tr '[:upper:]' '[:lower:]')"
        
        cat > "${USER_WALLET_FILE}" <<EOF
{
    "id": "${wallet_id}",
    "address": "${wallet_address}",
    "chain": "${DEFAULT_CHAIN:-ARC-TESTNET}"
}
EOF
    fi
    
    local wallet=$(cat "${USER_WALLET_FILE}")
    echo -e "${GREEN}✓ Your SkillMint wallet: $(echo "$wallet" | jq -r '.address')${NC}"
    echo -e "${YELLOW}\nTo fund, send USDC to this address on $(echo "$wallet" | jq -r '.chain')${NC}"
}

# Show wallet
cmd_wallet() {
    echo -e "${BLUE}\n🔐 Your SkillMint Wallet\n${NC}"
    
    if [ -f "${USER_WALLET_FILE}" ]; then
        local wallet=$(cat "${USER_WALLET_FILE}")
        echo "Address: $(echo "$wallet" | jq -r '.address')"
        echo "Chain: $(echo "$wallet" | jq -r '.chain')"
        echo "ID: $(echo "$wallet" | jq -r '.id')"
    else
        echo -e "${YELLOW}No wallet configured yet. Run: skillmint fund <amount>${NC}"
    fi
}

# Charge for skill usage (internal command)
cmd_charge() {
    local skill_name="$1"
    local caller_id="$2"
    
    local skill=$(jq ".skills[] | select(.name == \"${skill_name}\")" "${REGISTRY_FILE}")
    
    if [ -z "$skill" ] || [ "$skill" = "null" ]; then
        echo '{"success":false,"error":"Skill not registered"}'
        exit 1
    fi
    
    local price=$(echo "$skill" | jq -r '.price')
    local tx_hash="0x$(openssl rand -hex 32)"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Update stats
    jq "(.skills[] | select(.name == \"${skill_name}\")).totalCalls += 1 | (.skills[] | select(.name == \"${skill_name}\")).totalEarnings += ${price}" "${REGISTRY_FILE}" > "${REGISTRY_FILE}.tmp" && mv "${REGISTRY_FILE}.tmp" "${REGISTRY_FILE}"
    
    # Log usage
    local entry="{\"skill\":\"${skill_name}\",\"caller\":\"${caller_id}\",\"amount\":${price},\"timestamp\":\"${timestamp}\",\"txHash\":\"${tx_hash}\"}"
    jq ".entries += [${entry}]" "${USAGE_FILE}" > "${USAGE_FILE}.tmp" && mv "${USAGE_FILE}.tmp" "${USAGE_FILE}"
    
    echo "{\"success\":true,\"amount\":${price},\"txHash\":\"${tx_hash}\"}"
}

# Show usage history
cmd_usage() {
    local skill_filter="$1"
    
    echo -e "${BLUE}\n📈 Usage History\n${NC}"
    
    local entries
    if [ -n "$skill_filter" ]; then
        entries=$(jq -c ".entries[] | select(.skill == \"${skill_filter}\")" "${USAGE_FILE}" | tail -10)
    else
        entries=$(jq -c '.entries[]' "${USAGE_FILE}" | tail -10)
    fi
    
    if [ -z "$entries" ]; then
        echo -e "${YELLOW}No usage recorded yet.${NC}"
        return
    fi
    
    echo "$entries" | while read -r entry; do
        local timestamp=$(echo "$entry" | jq -r '.timestamp')
        local skill=$(echo "$entry" | jq -r '.skill')
        local amount=$(echo "$entry" | jq -r '.amount')
        echo "${timestamp} | ${skill} | ${amount} USDC"
    done
}

# Show help
cmd_help() {
    echo -e "${BLUE}SkillMint - Monetize OpenClaw skills with USDC micropayments${NC}"
    echo ""
    echo "Usage: skillmint <command> [options]"
    echo ""
    echo "Creator Commands:"
    echo "  register <skill> <price>   Register a skill for monetization"
    echo "  unregister <skill>         Remove skill from monetization"
    echo "  update <skill> <price>     Update skill pricing"
    echo "  earnings [--skill <name>]  View earnings breakdown"
    echo ""
    echo "User Commands:"
    echo "  fund <amount>              Add USDC to your balance"
    echo "  balance                    Check your SkillMint balance"
    echo "  usage [--skill <name>]     View usage history"
    echo ""
    echo "Admin Commands:"
    echo "  wallet                     Show your SkillMint wallet"
    echo "  skills                     List all monetized skills"
    echo "  skill <name>               View skill details"
    echo ""
    echo "Internal:"
    echo "  charge <skill> <caller>    Charge for skill usage"
}

# Main
main() {
    init_config
    load_circle_config
    
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        register)
            cmd_register "$1" "$2" "$3"
            ;;
        unregister)
            cmd_unregister "$1"
            ;;
        update)
            cmd_update "$1" "$2"
            ;;
        earnings)
            cmd_earnings "$1"
            ;;
        skills)
            cmd_skills
            ;;
        skill)
            cmd_skill "$1"
            ;;
        balance)
            cmd_balance
            ;;
        fund)
            cmd_fund "$1"
            ;;
        wallet)
            cmd_wallet
            ;;
        usage)
            cmd_usage "$1"
            ;;
        charge)
            cmd_charge "$1" "$2"
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            echo -e "${RED}Unknown command: ${command}${NC}"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
