#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { SkillMint } from './skillmint';
import { Registry } from './registry';

const program = new Command();
const skillmint = new SkillMint();
const registry = new Registry();

program
  .name('skillmint')
  .description('Monetize OpenClaw skills with USDC micropayments')
  .version('1.0.0');

// === Creator Commands ===

program
  .command('register <skill-name>')
  .description('Register a skill for monetization')
  .requiredOption('-p, --price <amount>', 'Price per call in USDC')
  .option('-c, --chain <chain>', 'Preferred payout chain', 'ARC-TESTNET')
  .action(async (skillName, options) => {
    try {
      console.log(chalk.blue(`Registering ${skillName} at $${options.price}/call...`));
      
      // Create wallet for creator if needed
      const wallet = await skillmint.getOrCreateWallet(skillName);
      
      // Register in registry
      await registry.registerSkill({
        name: skillName,
        price: parseFloat(options.price),
        chain: options.chain,
        walletAddress: wallet.address,
        walletId: wallet.id,
        createdAt: new Date().toISOString(),
        totalCalls: 0,
        totalEarnings: 0
      });
      
      console.log(chalk.green(`✓ Registered ${skillName} at $${options.price}/call`));
      console.log(chalk.green(`✓ Payout wallet: ${wallet.address} (${options.chain})`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('unregister <skill-name>')
  .description('Remove a skill from monetization')
  .action(async (skillName) => {
    try {
      await registry.unregisterSkill(skillName);
      console.log(chalk.green(`✓ Unregistered ${skillName}`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('update <skill-name>')
  .description('Update skill pricing')
  .option('-p, --price <amount>', 'New price per call in USDC')
  .action(async (skillName, options) => {
    try {
      if (options.price) {
        await registry.updateSkillPrice(skillName, parseFloat(options.price));
        console.log(chalk.green(`✓ Updated ${skillName} to $${options.price}/call`));
      }
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('earnings')
  .description('View your earnings')
  .option('-s, --skill <name>', 'Filter by skill name')
  .action(async (options) => {
    try {
      const skills = await registry.getSkills();
      const filtered = options.skill 
        ? skills.filter(s => s.name === options.skill)
        : skills;
      
      if (filtered.length === 0) {
        console.log(chalk.yellow('No monetized skills found.'));
        return;
      }
      
      console.log(chalk.blue('\n📊 Earnings Report\n'));
      let totalEarnings = 0;
      
      for (const skill of filtered) {
        const netEarnings = skill.totalEarnings * 0.95; // 5% platform fee
        totalEarnings += netEarnings;
        console.log(`${chalk.bold(skill.name)}`);
        console.log(`  Calls: ${skill.totalCalls}`);
        console.log(`  Gross: ${skill.totalEarnings.toFixed(4)} USDC`);
        console.log(`  Net (95%): ${chalk.green(netEarnings.toFixed(4) + ' USDC')}`);
        console.log(`  Wallet: ${skill.walletAddress}`);
        console.log();
      }
      
      console.log(chalk.bold(`Total Net Earnings: ${chalk.green(totalEarnings.toFixed(4) + ' USDC')}`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('withdraw')
  .description('Withdraw earnings to external address')
  .option('-a, --amount <usdc>', 'Amount to withdraw')
  .option('-t, --to <address>', 'Destination address')
  .option('-s, --skill <name>', 'Withdraw from specific skill')
  .action(async (options) => {
    try {
      console.log(chalk.blue('Initiating withdrawal...'));
      const result = await skillmint.withdraw({
        amount: options.amount ? parseFloat(options.amount) : undefined,
        to: options.to,
        skill: options.skill
      });
      console.log(chalk.green(`✓ Withdrawn ${result.amount} USDC`));
      console.log(chalk.green(`  TX: ${result.txHash}`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

// === User Commands ===

program
  .command('fund <amount>')
  .description('Add USDC to your SkillMint balance')
  .option('-f, --from <address>', 'Source address')
  .action(async (amount, options) => {
    try {
      console.log(chalk.blue(`Funding account with ${amount} USDC...`));
      const wallet = await skillmint.getUserWallet();
      console.log(chalk.green(`✓ Your SkillMint wallet: ${wallet.address}`));
      console.log(chalk.yellow(`\nTo fund, send USDC to this address on ${wallet.chain}`));
      
      // Check current balance
      const balance = await skillmint.getBalance(wallet.id);
      console.log(chalk.blue(`Current balance: ${balance} USDC`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('balance')
  .description('Check your SkillMint balance')
  .action(async () => {
    try {
      const wallet = await skillmint.getUserWallet();
      const balance = await skillmint.getBalance(wallet.id);
      console.log(chalk.blue('\n💰 SkillMint Balance\n'));
      console.log(`Wallet: ${wallet.address}`);
      console.log(`Chain: ${wallet.chain}`);
      console.log(`Balance: ${chalk.green(balance + ' USDC')}`);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('usage')
  .description('View your skill usage history')
  .option('-s, --skill <name>', 'Filter by skill name')
  .action(async (options) => {
    try {
      const usage = await registry.getUsage(options.skill);
      console.log(chalk.blue('\n📈 Usage History\n'));
      
      if (usage.length === 0) {
        console.log(chalk.yellow('No usage recorded yet.'));
        return;
      }
      
      for (const entry of usage.slice(-10)) {
        console.log(`${entry.timestamp} | ${entry.skill} | ${entry.amount} USDC`);
      }
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

// === Admin Commands ===

program
  .command('wallet')
  .description('Show your SkillMint wallet address')
  .action(async () => {
    try {
      const wallet = await skillmint.getUserWallet();
      console.log(chalk.blue('\n🔐 Your SkillMint Wallet\n'));
      console.log(`Address: ${wallet.address}`);
      console.log(`Chain: ${wallet.chain}`);
      console.log(`ID: ${wallet.id}`);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('skills')
  .description('List all monetized skills')
  .action(async () => {
    try {
      const skills = await registry.getSkills();
      console.log(chalk.blue('\n🛠️  Monetized Skills\n'));
      
      if (skills.length === 0) {
        console.log(chalk.yellow('No monetized skills registered yet.'));
        return;
      }
      
      console.log('Name'.padEnd(25) + 'Price'.padEnd(12) + 'Calls'.padEnd(10) + 'Earnings');
      console.log('-'.repeat(60));
      
      for (const skill of skills) {
        console.log(
          skill.name.padEnd(25) +
          `$${skill.price.toFixed(4)}`.padEnd(12) +
          skill.totalCalls.toString().padEnd(10) +
          `$${skill.totalEarnings.toFixed(4)}`
        );
      }
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command('skill <name>')
  .description('View detailed skill info')
  .action(async (name) => {
    try {
      const skill = await registry.getSkill(name);
      if (!skill) {
        console.log(chalk.yellow(`Skill '${name}' not found.`));
        return;
      }
      
      console.log(chalk.blue(`\n🔍 Skill: ${skill.name}\n`));
      console.log(`Price: $${skill.price}/call`);
      console.log(`Chain: ${skill.chain}`);
      console.log(`Wallet: ${skill.walletAddress}`);
      console.log(`Total Calls: ${skill.totalCalls}`);
      console.log(`Total Earnings: $${skill.totalEarnings.toFixed(4)}`);
      console.log(`Registered: ${skill.createdAt}`);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

// === Payment Command (internal use) ===

program
  .command('charge <skill-name> <caller-id>')
  .description('Charge for skill usage (internal)')
  .action(async (skillName, callerId) => {
    try {
      const result = await skillmint.chargeForSkill(skillName, callerId);
      console.log(JSON.stringify(result));
    } catch (err: any) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(1);
    }
  });

program.parse();
