import fs from 'fs/promises'
import path from 'path'

export interface TSGramConfig {
  defaultFlag: '-e' | '-r'
  lastDeployment?: string
  enhancementSettings?: {
    alwaysEnhanceCommands?: string[]
    neverEnhanceCommands?: string[]
  }
}

export class TSGramConfigManager {
  private configPath: string
  private config: TSGramConfig

  constructor(configDir: string = process.env.WORKSPACE_PATH ? path.join(process.env.WORKSPACE_PATH, 'data') : '/app/data') {
    this.configPath = path.join(configDir, 'tsgram-config.json')
    this.config = { defaultFlag: '-r' } // Default to raw
  }

  async load(): Promise<TSGramConfig> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      this.config = JSON.parse(data)
      return this.config
    } catch (error) {
      // If file doesn't exist, create it with defaults
      await this.save()
      return this.config
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.configPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2))
  }

  async setDefaultFlag(flag: '-e' | '-r'): Promise<void> {
    this.config.defaultFlag = flag
    await this.save()
  }

  getDefaultFlag(): '-e' | '-r' {
    return this.config.defaultFlag
  }

  async updateLastDeployment(): Promise<void> {
    this.config.lastDeployment = new Date().toISOString()
    await this.save()
  }

  isFirstDeployment(): boolean {
    return !this.config.lastDeployment
  }
}