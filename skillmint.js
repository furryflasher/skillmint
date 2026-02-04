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
  return loadJSON(WALLETS_FILE, { skills: {}, callers: {} });
}

function saveWallets(wallets) {
  saveJSON(WALLETS_FILE, wallets);
}

function getCircleConfig() {
  return loadJSON(CIRCLE_CONFIG, { defaultChain: 'ARC-TESTNET' });
}

// ============================================
// Wallet Management (Circle DCW Integration)
// ============================================

function generateMockWallet(name, chain) {
  return {
    id: `sm-${crypto.randomUUID().slice(0, 8)}`,
    address: '0x' + crypto.randomBytes(20).toString('hex'),
    chain: chain,
    name: name,
    createdAt: new Date().toISOString()
  };
}

async function createSkillWallet(skillName) {
  const config = getCircleConfig();
  const chain = config.defaultChain || 'ARC-TESTNET';
  
  const wallets = getWallets();
  if (wallets.skills[skillName]) {
    return wallets.skills[skillName];
  }

  // TODO: Real Circle API call
  // For now, generate mock wallet
  const wallet = generateMockWallet(`skill-${skillName}`, chain);
  wallets.skills[skillName] = wallet;
  saveWallets(wallets);
  
  return wallet;
}

async function getCallerWallet(callerId) {
  const config = getCircleConfig();
  const chain = config.defaultChain || 'ARC-TESTNET';
  
  const wallets = getWallets();
  if (wallets.callers[callerId]) {
    return wallets.callers[callerId];
  }

  const wallet = generateMockWallet(`caller-${callerId.slice(0, 8)}`, chain);
  wallets.callers[callerId] = wallet;
  saveWallets(wallets);
  
  return wallet;
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
    console.log(c.dim(`  Chain: ${wallet.chain}`));
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

      console.log(c.bold(skill.name));
      console.log(`  Calls:  ${skill.totalCalls}`);
      console.log(`  Gross:  ${skill.totalEarnings.toFixed(4)} USDC`);
      console.log(`  Net:    ${c.green(net.toFixed(4) + ' USDC')} (${((1-PLATFORM_FEE)*100)}%)`);
      console.log(`  Wallet: ${c.dim(skill.walletAddress)}`);
      console.log();
    }

    console.log(c.bold('─'.repeat(40)));
    console.log(c.bold(`Total Gross: ${totalGross.toFixed(4)} USDC`));
    console.log(c.bold(`Total Net:   ${c.green(totalNet.toFixed(4) + ' USDC')}`));
  },

  // --- User Commands ---

  fund: async (args) => {
    const [amount] = args;
    const config = getCircleConfig();
    
    console.log(c.blue('Setting up SkillMint wallet...\n'));

    const wallets = getWallets();
    let userWallet = wallets.user;
    
    if (!userWallet) {
      userWallet = generateMockWallet('user-main', config.defaultChain || 'ARC-TESTNET');
      wallets.user = userWallet;
      saveWallets(wallets);
    }

    console.log(c.green(`Your SkillMint wallet: ${userWallet.address}`));
    console.log(c.dim(`Chain: ${userWallet.chain}\n`));
    
    if (amount) {
      console.log(c.yellow(`To add ${amount} USDC, send to the address above on ${userWallet.chain}`));
    } else {
      console.log(c.yellow('Send USDC to the address above to fund your account'));
    }
  },

  balance: async () => {
    const wallets = getWallets();
    
    console.log(c.blue('\n💰 SkillMint Balance\n'));

    if (!wallets.user) {
      console.log(c.yellow('No wallet configured. Run: skillmint fund'));
      return;
    }

    console.log(`Wallet:  ${wallets.user.address}`);
    console.log(`Chain:   ${wallets.user.chain}`);
    console.log(`Balance: ${c.green('100.00 USDC')} ${c.dim('(demo)')}`);
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
    console.log(c.dim('Timestamp'.padEnd(24) + 'Skill'.padEnd(20) + 'Amount'));
    console.log(c.dim('─'.repeat(55)));
    
    for (const e of recent) {
      const time = e.timestamp.slice(0, 19).replace('T', ' ');
      console.log(`${time}  ${e.skill.padEnd(18)}  ${e.amount} USDC`);
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
      console.log();
    }

    const skillNames = Object.keys(wallets.skills || {});
    if (skillNames.length > 0) {
      console.log(c.bold('Skill Wallets:'));
      for (const name of skillNames) {
        const w = wallets.skills[name];
        console.log(`  ${name}: ${w.address} (${w.chain})`);
      }
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
    console.log(`Status:     ${skill.active ? c.green('Active') : c.yellow('Paused')}`);
    console.log(`Calls:      ${skill.totalCalls}`);
    console.log(`Gross:      $${skill.totalEarnings.toFixed(4)}`);
    console.log(`Net (95%):  ${c.green('$' + netEarnings.toFixed(4))}`);
    console.log(`Registered: ${skill.createdAt}`);
  },

  // --- Internal Commands ---

  charge: async (args) => {
    const [skillName, callerId] = args;
    
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

    // Record the charge
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const timestamp = new Date().toISOString();

    skill.totalCalls += 1;
    skill.totalEarnings += skill.price;
    saveRegistry(reg);

    // Log usage
    const usage = getUsage();
    usage.entries.push({
      skill: skillName,
      caller: callerId,
      amount: skill.price,
      timestamp,
      txHash,
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
      txHash,
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
        active: skill.active 
      }));
    }
  },

  // --- Help ---

  help: async () => {
    console.log(c.blue(`
╔═══════════════════════════════════════════════════════╗
║  SkillMint - Monetize OpenClaw skills with USDC       ║
╚═══════════════════════════════════════════════════════╝
`));
    console.log('Usage: skillmint <command> [options]\n');
    
    console.log(c.bold('Creator Commands:'));
    console.log('  register <skill> <price>  Register skill for monetization');
    console.log('  unregister <skill>        Remove skill');
    console.log('  update <skill> <price>    Update pricing');
    console.log('  earnings [skill]          View earnings\n');
    
    console.log(c.bold('User Commands:'));
    console.log('  fund [amount]             Set up/view funding wallet');
    console.log('  balance                   Check balance');
    console.log('  usage [skill]             View usage history\n');
    
    console.log(c.bold('Admin Commands:'));
    console.log('  wallet                    Show all wallets');
    console.log('  skills                    List registered skills');
    console.log('  skill <name>              View skill details\n');
    
    console.log(c.bold('Internal (for automation):'));
    console.log('  charge <skill> <caller>   Charge for usage (JSON output)');
    console.log('  price <skill>             Get skill price (JSON output)\n');
    
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
      process.exit(1);
    }
  } else {
    console.log(c.red(`Unknown command: ${cmd}`));
    console.log(c.dim('Run "skillmint help" for usage'));
    process.exit(1);
  }
}

main();
