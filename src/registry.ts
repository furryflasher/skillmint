import * as fs from 'fs';
import * as path from 'path';

const CONFIG_DIR = path.join(process.env.HOME || '', '.openclaw', 'skillmint');
const REGISTRY_FILE = path.join(CONFIG_DIR, 'registry.json');
const USAGE_FILE = path.join(CONFIG_DIR, 'usage.json');

export interface Skill {
  name: string;
  price: number;
  chain: string;
  walletAddress: string;
  walletId: string;
  createdAt: string;
  totalCalls: number;
  totalEarnings: number;
}

export interface UsageEntry {
  skill: string;
  caller: string;
  amount: number;
  timestamp: string;
  txHash?: string;
}

export class Registry {
  constructor() {
    this.ensureFiles();
  }
  
  private ensureFiles(): void {
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
  
  private readRegistry(): { skills: Skill[] } {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  }
  
  private writeRegistry(data: { skills: Skill[] }): void {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
  }
  
  private readUsage(): { entries: UsageEntry[] } {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
  }
  
  private writeUsage(data: { entries: UsageEntry[] }): void {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  }
  
  /**
   * Register a new skill
   */
  async registerSkill(skill: Skill): Promise<void> {
    const registry = this.readRegistry();
    
    // Check if already exists
    const existing = registry.skills.find(s => s.name === skill.name);
    if (existing) {
      throw new Error(`Skill '${skill.name}' is already registered`);
    }
    
    registry.skills.push(skill);
    this.writeRegistry(registry);
  }
  
  /**
   * Unregister a skill
   */
  async unregisterSkill(name: string): Promise<void> {
    const registry = this.readRegistry();
    const index = registry.skills.findIndex(s => s.name === name);
    
    if (index === -1) {
      throw new Error(`Skill '${name}' not found`);
    }
    
    registry.skills.splice(index, 1);
    this.writeRegistry(registry);
  }
  
  /**
   * Update skill pricing
   */
  async updateSkillPrice(name: string, price: number): Promise<void> {
    const registry = this.readRegistry();
    const skill = registry.skills.find(s => s.name === name);
    
    if (!skill) {
      throw new Error(`Skill '${name}' not found`);
    }
    
    skill.price = price;
    this.writeRegistry(registry);
  }
  
  /**
   * Get all registered skills
   */
  async getSkills(): Promise<Skill[]> {
    return this.readRegistry().skills;
  }
  
  /**
   * Get a specific skill
   */
  async getSkill(name: string): Promise<Skill | undefined> {
    const registry = this.readRegistry();
    return registry.skills.find(s => s.name === name);
  }
  
  /**
   * Record usage (update stats)
   */
  async recordUsage(skillName: string, amount: number): Promise<void> {
    const registry = this.readRegistry();
    const skill = registry.skills.find(s => s.name === skillName);
    
    if (skill) {
      skill.totalCalls += 1;
      skill.totalEarnings += amount;
      this.writeRegistry(registry);
    }
  }
  
  /**
   * Log a usage entry
   */
  async logUsage(entry: UsageEntry): Promise<void> {
    const usage = this.readUsage();
    usage.entries.push(entry);
    
    // Keep only last 1000 entries
    if (usage.entries.length > 1000) {
      usage.entries = usage.entries.slice(-1000);
    }
    
    this.writeUsage(usage);
  }
  
  /**
   * Get usage history
   */
  async getUsage(skillName?: string): Promise<UsageEntry[]> {
    const usage = this.readUsage();
    if (skillName) {
      return usage.entries.filter(e => e.skill === skillName);
    }
    return usage.entries;
  }
}
