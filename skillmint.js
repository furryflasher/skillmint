#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// Config paths
const CONFIG_DIR = path.join(process.env.HOME || '', '.openclaw', 'skillmint');
const REGISTRY_FILE = path.join(CONFIG_DIR, 'registry.json');
const USAGE_FILE = path.join(CONFIG_DIR, 'usage.json');
const USER_WALLET_FILE = path.join(CONFIG_DIR, 'user-wallet.json');
const CIRCLE_CONFIG = path.join(process.env.HOME || '', '.openclaw', 'circle-wallet', 'config.json');

// Colors
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// Initialize config
function initConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(REGISTRY_FILE)) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ skills: [] }, null, 2));
  }
  if (!fs.existsSync(USAGE_FILE)) {
    fs.writeFileSync(USAGE_FILE, JSON.stringify({ entries: [] }, null, 2));
  }
}

// Load registry
function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
}

// Save registry
function saveRegistry(data) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

// Load usage
function loadUsage() {
  return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
}

// Save usage
function saveUsage(data) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
}

// Load Circle config
function loadCircleConfig() {
  if (fs.existsSync(CIRCLE_CONFIG)) {
    return JSON.parse(fs.readFileSync(CIRCLE_CONFIG, 'utf-8'));
  }
  return { defaultChain: 'ARC-TESTNET' };
}

// Generate mock wallet address
function generateWalletAddress() {
  return '0x' + crypto.randomBytes(20).toString('hex');
}

// Generate UUID
function generateUUID() {
  return crypto.randomUUID();
}

// Commands
const commands = {
  // Register a skill
  register: (args) => {
    const skillName = args[0];
    const price = parseFloat(args[1]);
    const circleConfig = loadCircleConfig();
    const chain = args[2] || circleConfig.defaultChain || 'ARC-TESTNET';

    if (!skillName || isNaN(price)) {
      console.log(colors.red('Usage: skillmint register <skill-name> <price>'));
      process.exit(1);
    }

    console.log(colors.blue(`Registering ${skillName} at $${price}/call...`));

    const registry = loadRegistry();
    
    // Check if exists
    if (registry.skills.find(s => s.name === skillName)) {
      console.log(colors.red(`Error: Skill '${skillName}' is already registered`));
      process.exit(1);
    }

    // Create wallet
    const walletAddress = generateWalletAddress();
    const walletId = `skillmint-${generateUUID()}`;

    registry.skills.push({
      name: skillName,
      price: price,
      chain: chain,
      walletAddress: walletAddress,
      walletId: walletId,
      createdAt: new Date().toISOString(),
      totalCalls: 0,
      totalEarnings: 0
    });

    saveRegistry(registry);

    console.log(colors.green(`✓ Registered ${skillName} at $${price}/call`));
    console.log(colors.green(`✓ Payout wallet: ${walletAddress} (${chain})`));
  },

  // Unregister a skill
  unregister: (args) => {
    const skillName = args[0];
    if (!skillName) {
      console.log(colors.red('Usage: skillmint unregister <skill-name>'));
      process.exit(1);
    }

    const registry = loadRegistry();
    registry.skills = registry.skills.filter(s => s.name !== skillName);
    saveRegistry(registry);

    console.log(colors.green(`✓ Unregistered ${skillName}`));
  },

  // Update skill pricing
  update: (args) => {
    const skillName = args[0];
    const price = parseFloat(args[1]);

    if (!skillName || isNaN(price)) {
      console.log(colors.red('Usage: skillmint update <skill-name> <new-price>'));
      process.exit(1);
    }

    const registry = loadRegistry();
    const skill = registry.skills.find(s => s.name === skillName);

    if (!skill) {
      console.log(colors.red(`Error: Skill '${skillName}' not found`));
      process.exit(1);
    }

    skill.price = price;
    saveRegistry(registry);

    console.log(colors.green(`✓ Updated ${skillName} to $${price}/call`));
  },

  // View earnings
  earnings: (args) => {
    const skillFilter = args[0];
    const registry = loadRegistry();

    console.log(colors.blue('\n📊 Earnings Report\n'));

    let skills = registry.skills;
    if (skillFilter) {
      skills = skills.filter(s => s.name === skillFilter);
    }

    if (skills.length === 0) {
      console.log(colors.yellow('No monetized skills found.'));
      return;
    }

    let totalNet = 0;
    for (const skill of skills) {
      const netEarnings = skill.totalEarnings * 0.95;
      totalNet += netEarnings;

      console.log(colors.bold(skill.name));
      console.log(`  Calls: ${skill.totalCalls}`);
      console.log(`  Gross: ${skill.totalEarnings.toFixed(4)} USDC`);
      console.log(`  Net (95%): ${colors.green(netEarnings.toFixed(4) + ' USDC')}`);
      console.log(`  Wallet: ${skill.walletAddress}`);
      console.log();
    }

    console.log(colors.bold(`Total Net Earnings: ${colors.green(totalNet.toFixed(4) + ' USDC')}`));
  },

  // List all skills
  skills: () => {
    const registry = loadRegistry();

    console.log(colors.blue('\n🛠️  Monetized Skills\n'));

    if (registry.skills.length === 0) {
      console.log(colors.yellow('No monetized skills registered yet.'));
      return;
    }

    console.log('Name'.padEnd(25) + 'Price'.padEnd(12) + 'Calls'.padEnd(10) + 'Earnings');
    console.log('-'.repeat(60));

    for (const skill of registry.skills) {
      console.log(
        skill.name.padEnd(25) +
        `$${skill.price.toFixed(4)}`.padEnd(12) +
        skill.totalCalls.toString().padEnd(10) +
        `$${skill.totalEarnings.toFixed(4)}`
      );
    }
  },

  // View skill details
  skill: (args) => {
    const skillName = args[0];
    if (!skillName) {
      console.log(colors.red('Usage: skillmint skill <name>'));
      process.exit(1);
    }

    const registry = loadRegistry();
    const skill = registry.skills.find(s => s.name === skillName);

    if (!skill) {
      console.log(colors.yellow(`Skill '${skillName}' not found.`));
      return;
    }

    console.log(colors.blue(`\n🔍 Skill: ${skill.name}\n`));
    console.log(`Price: $${skill.price}/call`);
    console.log(`Chain: ${skill.chain}`);
    console.log(`Wallet: ${skill.walletAddress}`);
    console.log(`Total Calls: ${skill.totalCalls}`);
    console.log(`Total Earnings: $${skill.totalEarnings.toFixed(4)}`);
    console.log(`Registered: ${skill.createdAt}`);
  },

  // Check balance
  balance: () => {
    console.log(colors.blue('\n💰 SkillMint Balance\n'));

    if (fs.existsSync(USER_WALLET_FILE)) {
      const wallet = JSON.parse(fs.readFileSync(USER_WALLET_FILE, 'utf-8'));
      console.log(`Wallet: ${wallet.address}`);
      console.log(`Chain: ${wallet.chain}`);
      console.log(`Balance: ${colors.green('100.00 USDC')} (demo)`);
    } else {
      console.log(colors.yellow('No wallet configured yet. Run: skillmint fund <amount>'));
    }
  },

  // Fund account
  fund: (args) => {
    const amount = args[0];
    const circleConfig = loadCircleConfig();

    console.log(colors.blue('Setting up SkillMint wallet...'));

    if (!fs.existsSync(USER_WALLET_FILE)) {
      const wallet = {
        id: `skillmint-user-${generateUUID()}`,
        address: generateWalletAddress(),
        chain: circleConfig.defaultChain || 'ARC-TESTNET'
      };
      fs.writeFileSync(USER_WALLET_FILE, JSON.stringify(wallet, null, 2));
    }

    const wallet = JSON.parse(fs.readFileSync(USER_WALLET_FILE, 'utf-8'));
    console.log(colors.green(`✓ Your SkillMint wallet: ${wallet.address}`));
    console.log(colors.yellow(`\nTo fund, send USDC to this address on ${wallet.chain}`));
  },

  // Show wallet
  wallet: () => {
    console.log(colors.blue('\n🔐 Your SkillMint Wallet\n'));

    if (fs.existsSync(USER_WALLET_FILE)) {
      const wallet = JSON.parse(fs.readFileSync(USER_WALLET_FILE, 'utf-8'));
      console.log(`Address: ${wallet.address}`);
      console.log(`Chain: ${wallet.chain}`);
      console.log(`ID: ${wallet.id}`);
    } else {
      console.log(colors.yellow('No wallet configured yet. Run: skillmint fund <amount>'));
    }
  },

  // Show usage history
  usage: (args) => {
    const skillFilter = args[0];
    const usage = loadUsage();

    console.log(colors.blue('\n📈 Usage History\n'));

    let entries = usage.entries;
    if (skillFilter) {
      entries = entries.filter(e => e.skill === skillFilter);
    }

    if (entries.length === 0) {
      console.log(colors.yellow('No usage recorded yet.'));
      return;
    }

    for (const entry of entries.slice(-10)) {
      console.log(`${entry.timestamp} | ${entry.skill} | ${entry.amount} USDC`);
    }
  },

  // Charge for skill usage (internal)
  charge: (args) => {
    const skillName = args[0];
    const callerId = args[1];

    const registry = loadRegistry();
    const skill = registry.skills.find(s => s.name === skillName);

    if (!skill) {
      console.log(JSON.stringify({ success: false, error: 'Skill not registered' }));
      process.exit(1);
    }

    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const timestamp = new Date().toISOString();

    // Update stats
    skill.totalCalls += 1;
    skill.totalEarnings += skill.price;
    saveRegistry(registry);

    // Log usage
    const usage = loadUsage();
    usage.entries.push({
      skill: skillName,
      caller: callerId,
      amount: skill.price,
      timestamp: timestamp,
      txHash: txHash
    });
    if (usage.entries.length > 1000) {
      usage.entries = usage.entries.slice(-1000);
    }
    saveUsage(usage);

    console.log(JSON.stringify({ success: true, amount: skill.price, txHash: txHash }));
  },

  // Help
  help: () => {
    console.log(colors.blue('SkillMint - Monetize OpenClaw skills with USDC micropayments\n'));
    console.log('Usage: skillmint <command> [options]\n');
    console.log('Creator Commands:');
    console.log('  register <skill> <price>   Register a skill for monetization');
    console.log('  unregister <skill>         Remove skill from monetization');
    console.log('  update <skill> <price>     Update skill pricing');
    console.log('  earnings [skill]           View earnings breakdown\n');
    console.log('User Commands:');
    console.log('  fund <amount>              Add USDC to your balance');
    console.log('  balance                    Check your SkillMint balance');
    console.log('  usage [skill]              View usage history\n');
    console.log('Admin Commands:');
    console.log('  wallet                     Show your SkillMint wallet');
    console.log('  skills                     List all monetized skills');
    console.log('  skill <name>               View skill details\n');
    console.log('Internal:');
    console.log('  charge <skill> <caller>    Charge for skill usage');
  }
};

// Main
function main() {
  initConfig();

  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const commandArgs = args.slice(1);

  if (commands[command]) {
    commands[command](commandArgs);
  } else {
    console.log(colors.red(`Unknown command: ${command}`));
    commands.help();
    process.exit(1);
  }
}

main();
