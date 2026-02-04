#!/usr/bin/env node
/**
 * SkillMint - Monetize OpenClaw skills with USDC micropayments
 * Built on Circle Developer Controlled Wallets + CCTP
 * 
 * @author FurryFlasher
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Config paths
const HOME = process.env.HOME || '';
const CONFIG_DIR = path.join(HOME, '.openclaw', 'skillmint');
const REGISTRY_FILE = path.join(CONFIG_DIR, 'registry.json');
const USAGE_FILE = path.join(CONFIG_DIR, 'usage.json');
const WALLETS_FILE = path.join(CONFIG_DIR, 'wallets.json');
const CIRCLE_CONFIG = path.join(HOME, '.openclaw', 'circle-wallet', 'config.json');

// Platform fee (5%)
const PLATFORM_FEE = 0.05;

// Console colors
const c = {
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  blue: s => `\x1b[34m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

// ============================================
// Data Layer
// ============================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJSON(file, defaultVal = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getRegistry() {
  return loadJSON(REGISTRY_FILE, { skills: [], version: 1 });
}

function saveRegistry(reg) {
  saveJSON(REGISTRY_FILE, reg);
}

function getUsage() {
  return loadJSON(USAGE_FILE, { entries: [] });
}

function saveUsage(usage) {
  saveJSON(USAGE_FILE, usage);
}

function getWallets() {
  return loadJSON(WALLETS_FILE, { skills: {}, callers: {}, walletSetId: null });
}

function saveWallets(wallets) {
  saveJSON(WALLETS_FILE, wallets);
}

function getCircleConfig() {
  const config = loadJSON(CIRCLE_CONFIG, null);
  if (!config || !config.apiKey) {
    return null;
  }
  return config;
}

// ============================================
// Circle API Integration
// ============================================

let circleClient = null;

function getCircleClient() {
  if (circleClient) return circleClient;
  
  const config = getCircleConfig();
  if (!config) {
    throw new Error('Circle not configured. Run: circle-wallet setup --api-key <key>');
  }
  
  const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
  
  circleClient = initiateDeveloperControlledWalletsClient({
    apiKey: config.apiKey,
    entitySecret: config.entitySecret,
  });
  
  return circleClient;
}

// USDC Token IDs by chain
const USDC_TOKEN_IDS = {
  'ARC-TESTNET': '8d178b47-d3a3-5622-81aa-27c8c0ed4230',
  'ETH-SEPOLIA': '36b6931a-873a-56a8-8a27-b706b17104ee',
  'AVAX-FUJI': '83f71ff8-e80d-5e9a-8b63-ce0dd6e7c985',
  'MATIC-AMOY': '22d24a85-6b32-5e46-be02-8e7c4ce85b71',
  'ARB-SEPOLIA': 'e4f549f9-a910-59b1-b5cd-8f972871f5db',
  'BASE-SEPOLIA': 'a2791a9a-5542-5285-b4ea-ea3fb5ec8f4d',
  'OP-SEPOLIA': 'e906d04e-6b6d-5b8b-b8e6-f0f8f5a5c9e0',
  'SOL-DEVNET': 'd88c5af3-1f1c-513a-91e4-b01b1d4f3bd0',
  // Mainnets
  'ETH': '71ddb19d-0a23-5ed1-ae77-e80c523d6e6d',
  'MATIC': 'fe48cf09-73e5-5155-a9e9-3a69ed56a3e7',
  'ARB': '4b4e2e1b-1e7d-57f8-8c67-dd9ad3f1f83f',
  'BASE': 'f31f1e58-7b4d-5d5e-b1c6-9a8e6f2c4b3a',
  'AVAX': 'c47e0bf2-1e1c-5d1a-8d5f-6e9f3c4a2b7d',
  'SOL': '5797fbd6-3795-519d-84ca-ec4c5f80c3b1',
};

function getUSDCTokenId(chain) {
  return USDC_TOKEN_IDS[chain] || USDC_TOKEN_IDS['ARC-TESTNET'];
}

async function ensureWalletSet() {
  const wallets = getWallets();
  if (wallets.walletSetId) {
    return wallets.walletSetId;
  }
  
  const client = getCircleClient();
  console.log(c.dim('Creating SkillMint wallet set...'));
  
  const response = await client.createWalletSet({ name: 'SkillMint' });
  if (!response.data?.walletSet?.id) {
    throw new Error('Failed to create wallet set');
  }
  
  wallets.walletSetId = response.data.walletSet.id;
  saveWallets(wallets);
  
  return wallets.walletSetId;
}

async function createRealWallet(name, chain) {
  const client = getCircleClient();
  const walletSetId = await ensureWalletSet();
  
  const response = await client.createWallets({
    blockchains: [chain],
    count: 1,
    accountType: 'SCA',
    walletSetId,
  });
  
  if (!response.data?.wallets || response.data.wallets.length === 0) {
    throw new Error('Failed to create wallet');
  }
  
  const wallet = response.data.wallets[0];
  return {
    id: wallet.id,
    address: wallet.address,
    chain: chain,
    name: name,
    createdAt: new Date().toISOString()
  };
}

async function createSkillWallet(skillName) {
  const config = getCircleConfig();
  const chain = config?.defaultChain || 'ARC-TESTNET';
  
  const wallets = getWallets();
  if (wallets.skills[skillName]) {
    return wallets.skills[skillName];
  }

  // Use real Circle API
  const wallet = await createRealWallet(`skill-${skillName}`, chain);
  wallets.skills[skillName] = wallet;
  saveWallets(wallets);
  
  return wallet;
}

async function getOrCreateUserWallet() {
  const config = getCircleConfig();
  const chain = config?.defaultChain || 'ARC-TESTNET';
  
  const wallets = getWallets();
  if (wallets.user) {
    return wallets.user;
  }

  const wallet = await createRealWallet('skillmint-user', chain);
  wallets.user = wallet;
  saveWallets(wallets);
  
  return wallet;
}

async function getWalletBalance(walletId) {
  const client = getCircleClient();
  const response = await client.getWalletTokenBalance({ id: walletId });
  
  if (!response.data?.tokenBalances) {
    return 0;
  }

  const usdcBalance = response.data.tokenBalances.find(b =>
    b.token.symbol === 'USDC' ||
    b.token.symbol === 'USDC-TESTNET' ||
    (b.token.name && b.token.name.includes('USDC'))
  );

  return usdcBalance ? parseFloat(usdcBalance.amount) : 0;
}

async function transferUSDC(fromWalletId, toAddress, amount, chain) {
  const client = getCircleClient();
  const tokenId = getUSDCTokenId(chain);
  
  const response = await client.createTransaction({
    walletId: fromWalletId,
    tokenId,
    destinationAddress: toAddress,
    amount: [amount.toString()],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  if (!response.data?.id) {
    throw new Error('Transaction creation failed');
  }

  return {
    transactionId: response.data.id,
    status: response.data.state || 'INITIATED'
  };
}

async function waitForTransaction(transactionId, maxWaitMs = 60000) {
  const client = getCircleClient();
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < maxWaitMs) {
    const response = await client.getTransaction({ id: transactionId });
    const tx = response.data?.transaction;
    
    if (tx) {
      if (tx.state === 'COMPLETE' || tx.state === 'CONFIRMED') {
        return { success: true, txHash: tx.txHash };
      }
      if (tx.state === 'FAILED' || tx.state === 'DENIED') {
        return { success: false, error: tx.errorReason || 'Transaction failed' };
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return { success: false, error: 'Transaction timeout' };
}

// ============================================
// Commands
// ============================================

const commands = {
  // --- Creator Commands ---
  
  register: async (args) => {
    const [skillName, priceStr, chain] = args;
    const price = parseFloat(priceStr);

    if (!skillName || isNaN(price) || price <= 0) {
      console.log(c.red('Usage: skillmint register <skill-name> <price> [chain]'));
      console.log(c.dim('  Example: skillmint register my-skill 0.05'));
      process.exit(1);
    }

    const reg = getRegistry();
    if (reg.skills.find(s => s.name === skillName)) {
      console.log(c.red(`Skill "${skillName}" is already registered`));
      process.exit(1);
    }

    console.log(c.blue(`Registering ${skillName} at $${price}/call...`));
    
    const wallet = await createSkillWallet(skillName);
    
    reg.skills.push({
      name: skillName,
      price: price,
      chain: wallet.chain,
      walletId: wallet.id,
      walletAddress: wallet.address,
      createdAt: new Date().toISOString(),
      totalCalls: 0,
      totalEarnings: 0,
      active: true
    });
    saveRegistry(reg);

    console.log(c.green(`✓ Registered "${skillName}" at $${price}/call`));
    console.log(c.green(`✓ Payout wallet: ${wallet.address}`));
    console.log(c.dim(`  Chain: ${wallet.chain} | Wallet ID: ${wallet.id}`));
  },

  unregister: async (args) => {
    const [skillName] = args;
    if (!skillName) {
      console.log(c.red('Usage: skillmint unregister <skill-name>'));
      process.exit(1);
    }

    const reg = getRegistry();
    const idx = reg.skills.findIndex(s => s.name === skillName);
    if (idx === -1) {
      console.log(c.yellow(`Skill "${skillName}" not found`));
      process.exit(1);
    }

    reg.skills.splice(idx, 1);
    saveRegistry(reg);
    console.log(c.green(`✓ Unregistered "${skillName}"`));
  },

  update: async (args) => {
    const [skillName, priceStr] = args;
    const price = parseFloat(priceStr);

    if (!skillName || isNaN(price) || price <= 0) {
      console.log(c.red('Usage: skillmint update <skill-name> <new-price>'));
      process.exit(1);
    }

    const reg = getRegistry();
    const skill = reg.skills.find(s => s.name === skillName);
    if (!skill) {
      console.log(c.yellow(`Skill "${skillName}" not found`));
      process.exit(1);
    }

    const oldPrice = skill.price;
    skill.price = price;
    saveRegistry(reg);
    
    console.log(c.green(`✓ Updated "${skillName}": $${oldPrice} → $${price}/call`));
  },

  earnings: async (args) => {
    const [filterSkill] = args;
    const reg = getRegistry();
    
    let skills = reg.skills;
    if (filterSkill) {
      skills = skills.filter(s => s.name === filterSkill);
    }

    console.log(c.blue('\n📊 Earnings Report\n'));

    if (skills.length === 0) {
      console.log(c.yellow('No skills registered yet.'));
      return;
    }

    let totalGross = 0;
    let totalNet = 0;

    for (const skill of skills) {
      const net = skill.totalEarnings * (1 - PLATFORM_FEE);
      totalGross += skill.totalEarnings;
      totalNet += net;

      // Get live balance if Circle is configured
      let liveBalance = null;
      try {
        liveBalance = await getWalletBalance(skill.walletId);
      } catch {}

      console.log(c.bold(skill.name));
      console.log(`  Calls:    ${skill.totalCalls}`);
      console.log(`  Gross:    ${skill.totalEarnings.toFixed(4)} USDC`);
      console.log(`  Net:      ${c.green(net.toFixed(4) + ' USDC')} (${((1-PLATFORM_FEE)*100)}%)`);
      if (liveBalance !== null) {
        console.log(`  Balance:  ${c.green(liveBalance.toFixed(4) + ' USDC')} (live)`);
      }
      console.log(`  Wallet:   ${c.dim(skill.walletAddress)}`);
      console.log();
    }

    console.log(c.bold('─'.repeat(40)));
    console.log(c.bold(`Total Gross: ${totalGross.toFixed(4)} USDC`));
    console.log(c.bold(`Total Net:   ${c.green(totalNet.toFixed(4) + ' USDC')}`));
  },

  // --- User Commands ---

  fund: async (args) => {
    const [amount] = args;
    
    console.log(c.blue('Setting up SkillMint wallet...\n'));

    const userWallet = await getOrCreateUserWallet();

    console.log(c.green(`Your SkillMint wallet: ${userWallet.address}`));
    console.log(c.dim(`Chain: ${userWallet.chain}`));
    console.log(c.dim(`Wallet ID: ${userWallet.id}\n`));
    
    if (amount) {
      console.log(c.yellow(`To add ${amount} USDC, send to the address above on ${userWallet.chain}`));
    } else {
      console.log(c.yellow('Send USDC to the address above to fund your account'));
    }
    
    // For testnet, offer drip option
    const config = getCircleConfig();
    if (config?.defaultChain?.includes('TESTNET') || config?.defaultChain?.includes('SEPOLIA')) {
      console.log(c.dim('\nTestnet? Get free USDC: circle-wallet drip'));
    }
  },

  balance: async () => {
    const wallets = getWallets();
    
    console.log(c.blue('\n💰 SkillMint Balance\n'));

    if (!wallets.user) {
      console.log(c.yellow('No wallet configured. Run: skillmint fund'));
      return;
    }

    const balance = await getWalletBalance(wallets.user.id);

    console.log(`Wallet:  ${wallets.user.address}`);
    console.log(`Chain:   ${wallets.user.chain}`);
    console.log(`Balance: ${c.green(balance.toFixed(4) + ' USDC')}`);
  },

  usage: async (args) => {
    const [filterSkill] = args;
    const usage = getUsage();
    
    console.log(c.blue('\n📈 Usage History\n'));

    let entries = usage.entries || [];
    if (filterSkill) {
      entries = entries.filter(e => e.skill === filterSkill);
    }

    if (entries.length === 0) {
      console.log(c.yellow('No usage recorded yet.'));
      return;
    }

    // Show last 15 entries
    const recent = entries.slice(-15);
    console.log(c.dim('Timestamp'.padEnd(24) + 'Skill'.padEnd(20) + 'Amount'.padEnd(12) + 'TX'));
    console.log(c.dim('─'.repeat(70)));
    
    for (const e of recent) {
      const time = e.timestamp.slice(0, 19).replace('T', ' ');
      const txShort = e.txHash ? e.txHash.slice(0, 10) + '...' : 'pending';
      console.log(`${time}  ${e.skill.padEnd(18)}  ${e.amount} USDC`.padEnd(58) + c.dim(txShort));
    }
  },

  // --- Admin Commands ---

  wallet: async () => {
    const wallets = getWallets();
    
    console.log(c.blue('\n🔐 SkillMint Wallets\n'));

    if (wallets.user) {
      console.log(c.bold('User Wallet:'));
      console.log(`  Address: ${wallets.user.address}`);
      console.log(`  Chain:   ${wallets.user.chain}`);
      console.log(`  ID:      ${wallets.user.id}`);
      
      try {
        const balance = await getWalletBalance(wallets.user.id);
        console.log(`  Balance: ${c.green(balance.toFixed(4) + ' USDC')}`);
      } catch {}
      console.log();
    }

    const skillNames = Object.keys(wallets.skills || {});
    if (skillNames.length > 0) {
      console.log(c.bold('Skill Wallets:'));
      for (const name of skillNames) {
        const w = wallets.skills[name];
        let balanceStr = '';
        try {
          const bal = await getWalletBalance(w.id);
          balanceStr = c.green(` [${bal.toFixed(2)} USDC]`);
        } catch {}
        console.log(`  ${name}: ${w.address}${balanceStr}`);
      }
    }
    
    if (wallets.walletSetId) {
      console.log(c.dim(`\nWallet Set ID: ${wallets.walletSetId}`));
    }
  },

  skills: async () => {
    const reg = getRegistry();
    
    console.log(c.blue('\n🛠️  Registered Skills\n'));

    if (reg.skills.length === 0) {
      console.log(c.yellow('No skills registered yet.'));
      console.log(c.dim('Run: skillmint register <name> <price>'));
      return;
    }

    console.log(c.dim('Name'.padEnd(22) + 'Price'.padEnd(10) + 'Calls'.padEnd(8) + 'Earnings'));
    console.log(c.dim('─'.repeat(55)));

    for (const s of reg.skills) {
      const status = s.active ? '' : c.dim(' (paused)');
      console.log(
        (s.name + status).padEnd(22) +
        `$${s.price.toFixed(4)}`.padEnd(10) +
        s.totalCalls.toString().padEnd(8) +
        `$${s.totalEarnings.toFixed(4)}`
      );
    }
  },

  skill: async (args) => {
    const [skillName] = args;
    if (!skillName) {
      console.log(c.red('Usage: skillmint skill <name>'));
      process.exit(1);
    }

    const reg = getRegistry();
    const skill = reg.skills.find(s => s.name === skillName);
    
    if (!skill) {
      console.log(c.yellow(`Skill "${skillName}" not found`));
      return;
    }

    const netEarnings = skill.totalEarnings * (1 - PLATFORM_FEE);

    console.log(c.blue(`\n🔍 Skill: ${skill.name}\n`));
    console.log(`Price:      $${skill.price}/call`);
    console.log(`Chain:      ${skill.chain}`);
    console.log(`Wallet:     ${skill.walletAddress}`);
    console.log(`Wallet ID:  ${skill.walletId}`);
    console.log(`Status:     ${skill.active ? c.green('Active') : c.yellow('Paused')}`);
    console.log(`Calls:      ${skill.totalCalls}`);
    console.log(`Gross:      $${skill.totalEarnings.toFixed(4)}`);
    console.log(`Net (95%):  ${c.green('$' + netEarnings.toFixed(4))}`);
    
    // Live balance
    try {
      const balance = await getWalletBalance(skill.walletId);
      console.log(`Live Bal:   ${c.green('$' + balance.toFixed(4))}`);
    } catch {}
    
    console.log(`Registered: ${skill.createdAt}`);
  },

  // --- Internal Commands ---

  charge: async (args) => {
    const [skillName, callerWalletId] = args;
    
    const reg = getRegistry();
    const skill = reg.skills.find(s => s.name === skillName);

    if (!skill) {
      console.log(JSON.stringify({ success: false, error: 'Skill not registered' }));
      process.exit(1);
    }

    if (!skill.active) {
      console.log(JSON.stringify({ success: false, error: 'Skill is paused' }));
      process.exit(1);
    }

    const timestamp = new Date().toISOString();
    let txHash = null;
    let transactionId = null;

    // Attempt real transfer if caller wallet ID provided
    if (callerWalletId && callerWalletId.length > 10) {
      try {
        const result = await transferUSDC(
          callerWalletId, 
          skill.walletAddress, 
          skill.price,
          skill.chain
        );
        transactionId = result.transactionId;
        
        // Wait for confirmation (max 30s for charge)
        const confirmation = await waitForTransaction(transactionId, 30000);
        if (confirmation.success) {
          txHash = confirmation.txHash;
        }
      } catch (err) {
        // Log error but still record the charge attempt
        console.error(c.dim(`Transfer error: ${err.message}`));
      }
    }

    // Record the charge
    skill.totalCalls += 1;
    skill.totalEarnings += skill.price;
    saveRegistry(reg);

    // Log usage
    const usage = getUsage();
    usage.entries.push({
      skill: skillName,
      caller: callerWalletId || 'unknown',
      amount: skill.price,
      timestamp,
      txHash: txHash || transactionId || 'pending',
      transactionId,
      walletAddress: skill.walletAddress
    });
    
    // Keep last 10000 entries
    if (usage.entries.length > 10000) {
      usage.entries = usage.entries.slice(-10000);
    }
    saveUsage(usage);

    console.log(JSON.stringify({
      success: true,
      skill: skillName,
      amount: skill.price,
      txHash: txHash || transactionId,
      transactionId,
      timestamp,
      creatorWallet: skill.walletAddress
    }));
  },

  price: async (args) => {
    const [skillName] = args;
    
    const reg = getRegistry();
    const skill = reg.skills.find(s => s.name === skillName);

    if (!skill) {
      console.log(JSON.stringify({ found: false }));
    } else {
      console.log(JSON.stringify({ 
        found: true, 
        price: skill.price,
        active: skill.active,
        chain: skill.chain,
        walletAddress: skill.walletAddress
      }));
    }
  },

  // Drip testnet USDC to user wallet
  drip: async () => {
    const wallets = getWallets();
    
    if (!wallets.user) {
      console.log(c.yellow('No wallet configured. Run: skillmint fund'));
      process.exit(1);
    }

    const config = getCircleConfig();
    const chain = config?.defaultChain || 'ARC-TESTNET';
    
    console.log(c.blue(`\n🚰 Get Testnet USDC\n`));
    console.log(`Wallet: ${wallets.user.address}`);
    console.log(`Chain:  ${chain}\n`);
    
    // Try using circle-wallet drip command if available
    const { execSync } = require('child_process');
    try {
      console.log(c.dim('Attempting drip via circle-wallet...'));
      execSync(`circle-wallet drip ${wallets.user.address}`, { stdio: 'inherit' });
    } catch {
      // Fallback to faucet instructions
      console.log(c.yellow('\nManual faucet options:'));
      console.log(`  1. Visit: ${c.blue('https://faucet.circle.com')}`);
      console.log(`  2. Run: ${c.dim('circle-wallet drip ' + wallets.user.address)}`);
      console.log(c.dim('\nNote: Faucet drips 20 USDC every 2 hours'));
    }
  },

  // --- Help ---

  help: async () => {
    console.log(c.blue(`
╔═══════════════════════════════════════════════════════╗
║  SkillMint - Monetize OpenClaw skills with USDC       ║
║  Built on Circle Developer Controlled Wallets         ║
╚═══════════════════════════════════════════════════════╝
`));
    console.log('Usage: skillmint <command> [options]\n');
    
    console.log(c.bold('Creator Commands:'));
    console.log('  register <skill> <price>  Register skill for monetization');
    console.log('  unregister <skill>        Remove skill');
    console.log('  update <skill> <price>    Update pricing');
    console.log('  earnings [skill]          View earnings (with live balances)\n');
    
    console.log(c.bold('User Commands:'));
    console.log('  fund [amount]             Set up/view funding wallet');
    console.log('  balance                   Check live balance');
    console.log('  drip                      Get testnet USDC (sandbox only)');
    console.log('  usage [skill]             View usage history\n');
    
    console.log(c.bold('Admin Commands:'));
    console.log('  wallet                    Show all wallets with balances');
    console.log('  skills                    List registered skills');
    console.log('  skill <name>              View skill details\n');
    
    console.log(c.bold('Internal (for automation):'));
    console.log('  charge <skill> <wallet>   Charge for usage (JSON output)');
    console.log('  price <skill>             Get skill price (JSON output)\n');
    
    console.log(c.dim('Requires: circle-wallet setup --api-key <key>'));
    console.log(c.dim('Docs: https://github.com/furryflasher/skillmint'));
  }
};

// ============================================
// Main
// ============================================

async function main() {
  ensureDir(CONFIG_DIR);

  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';
  const cmdArgs = args.slice(1);

  if (commands[cmd]) {
    try {
      await commands[cmd](cmdArgs);
    } catch (err) {
      console.error(c.red(`Error: ${err.message}`));
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  } else {
    console.log(c.red(`Unknown command: ${cmd}`));
    console.log(c.dim('Run "skillmint help" for usage'));
    process.exit(1);
  }
}

main();
