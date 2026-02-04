import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { Registry } from './registry';
import { CircleClient } from './circle';

const CONFIG_DIR = path.join(process.env.HOME || '', '.openclaw', 'skillmint');
const USER_WALLET_FILE = path.join(CONFIG_DIR, 'user-wallet.json');

interface Wallet {
  id: string;
  address: string;
  chain: string;
}

interface WithdrawOptions {
  amount?: number;
  to?: string;
  skill?: string;
}

interface ChargeResult {
  success: boolean;
  amount: number;
  txHash?: string;
  error?: string;
}

export class SkillMint {
  private registry: Registry;
  private circle: CircleClient;
  
  constructor() {
    this.ensureConfigDir();
    this.registry = new Registry();
    this.circle = new CircleClient();
  }
  
  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }
  
  /**
   * Get or create a wallet for a skill creator
   */
  async getOrCreateWallet(skillName: string): Promise<Wallet> {
    const walletsFile = path.join(CONFIG_DIR, 'skill-wallets.json');
    let wallets: Record<string, Wallet> = {};
    
    if (fs.existsSync(walletsFile)) {
      wallets = JSON.parse(fs.readFileSync(walletsFile, 'utf-8'));
    }
    
    if (wallets[skillName]) {
      return wallets[skillName];
    }
    
    // Create new wallet via Circle
    const wallet = await this.circle.createWallet(`skillmint-${skillName}`);
    wallets[skillName] = wallet;
    
    fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 2));
    return wallet;
  }
  
  /**
   * Get or create the user's SkillMint wallet
   */
  async getUserWallet(): Promise<Wallet> {
    if (fs.existsSync(USER_WALLET_FILE)) {
      return JSON.parse(fs.readFileSync(USER_WALLET_FILE, 'utf-8'));
    }
    
    // Create new user wallet
    const wallet = await this.circle.createWallet('skillmint-user');
    fs.writeFileSync(USER_WALLET_FILE, JSON.stringify(wallet, null, 2));
    return wallet;
  }
  
  /**
   * Get wallet balance
   */
  async getBalance(walletId: string): Promise<string> {
    return this.circle.getBalance(walletId);
  }
  
  /**
   * Charge a user for skill usage
   */
  async chargeForSkill(skillName: string, callerId: string): Promise<ChargeResult> {
    // Get skill info
    const skill = await this.registry.getSkill(skillName);
    if (!skill) {
      return { success: false, amount: 0, error: `Skill '${skillName}' not registered` };
    }
    
    // Get caller's wallet (or create one)
    const callerWallet = await this.getCallerWallet(callerId);
    
    // Check balance
    const balance = parseFloat(await this.getBalance(callerWallet.id));
    if (balance < skill.price) {
      return { 
        success: false, 
        amount: skill.price, 
        error: `Insufficient balance. Need ${skill.price} USDC, have ${balance}` 
      };
    }
    
    // Execute transfer from caller to skill creator
    try {
      const result = await this.circle.transfer({
        fromWalletId: callerWallet.id,
        toAddress: skill.walletAddress,
        amount: skill.price,
        chain: skill.chain
      });
      
      // Update registry stats
      await this.registry.recordUsage(skillName, skill.price);
      
      // Log usage
      await this.registry.logUsage({
        skill: skillName,
        caller: callerId,
        amount: skill.price,
        timestamp: new Date().toISOString(),
        txHash: result.txHash
      });
      
      return {
        success: true,
        amount: skill.price,
        txHash: result.txHash
      };
    } catch (err: any) {
      return {
        success: false,
        amount: skill.price,
        error: err.message
      };
    }
  }
  
  /**
   * Get or create a wallet for a caller
   */
  private async getCallerWallet(callerId: string): Promise<Wallet> {
    const walletsFile = path.join(CONFIG_DIR, 'caller-wallets.json');
    let wallets: Record<string, Wallet> = {};
    
    if (fs.existsSync(walletsFile)) {
      wallets = JSON.parse(fs.readFileSync(walletsFile, 'utf-8'));
    }
    
    if (wallets[callerId]) {
      return wallets[callerId];
    }
    
    // Create new wallet
    const wallet = await this.circle.createWallet(`skillmint-caller-${callerId.slice(0, 8)}`);
    wallets[callerId] = wallet;
    
    fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 2));
    return wallet;
  }
  
  /**
   * Withdraw earnings
   */
  async withdraw(options: WithdrawOptions): Promise<{ amount: number; txHash: string }> {
    const skills = await this.registry.getSkills();
    const targetSkills = options.skill 
      ? skills.filter(s => s.name === options.skill)
      : skills;
    
    if (targetSkills.length === 0) {
      throw new Error('No skills found for withdrawal');
    }
    
    // For now, withdraw from first skill
    const skill = targetSkills[0];
    const balance = parseFloat(await this.getBalance(skill.walletId));
    const amount = options.amount || balance;
    
    if (amount > balance) {
      throw new Error(`Insufficient balance. Have ${balance}, requested ${amount}`);
    }
    
    if (!options.to) {
      throw new Error('Destination address required (--to)');
    }
    
    const result = await this.circle.transfer({
      fromWalletId: skill.walletId,
      toAddress: options.to,
      amount: amount,
      chain: skill.chain
    });
    
    return {
      amount,
      txHash: result.txHash
    };
  }
}
