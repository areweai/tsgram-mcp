import { ModelType, SUPPORTED_MODELS, AIModelAPI, AIModelConfig } from '../types/index.js';
import { OpenAIAPI } from './OpenAIAPI.js';
import { OpenRouterAPI } from './OpenRouterAPI.js';

export class ChatModel implements AIModelConfig {
  public readonly model: string;
  public readonly trigger: string;
  public readonly api: AIModelAPI;

  constructor(model: ModelType) {
    if (!SUPPORTED_MODELS.includes(model)) {
      throw new Error(`Model ${model} is not supported. Supported models: ${SUPPORTED_MODELS.join(', ')}`);
    }

    this.model = model;
    this.trigger = `!${model}`;
    this.api = this.createAPI(model);
  }

  private createAPI(model: ModelType): AIModelAPI {
    switch (model) {
      case 'openai':
        return new OpenAIAPI({
          apiKey: process.env.OPENAI_API_KEY || '',
          apiBase: process.env.OPENAI_API_BASE,
          model: process.env.OPENAI_MODEL,
          maxHistory: parseInt(process.env.MAX_HISTORY || '5'),
          maxTokens: parseInt(process.env.MAX_TOKENS || '1024'),
        });

      case 'openrouter':
        return new OpenRouterAPI({
          apiKey: process.env.OPENROUTER_API_KEY || '',
          apiBase: process.env.OPENROUTER_API_BASE,
          model: process.env.OPENROUTER_MODEL,
          maxHistory: parseInt(process.env.MAX_HISTORY || '5'),
          maxTokens: parseInt(process.env.MAX_TOKENS || '1024'),
        });

      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }

  static getAvailableModels(): ModelType[] {
    return [...SUPPORTED_MODELS];
  }

  static isModelSupported(model: string): model is ModelType {
    return SUPPORTED_MODELS.includes(model as ModelType);
  }

  static createAPI(model: ModelType): AIModelAPI {
    switch (model) {
      case 'openai':
        return new OpenAIAPI({
          apiKey: process.env.OPENAI_API_KEY || '',
          apiBase: process.env.OPENAI_API_BASE,
          model: process.env.OPENAI_MODEL,
          maxHistory: parseInt(process.env.MAX_HISTORY || '5'),
          maxTokens: parseInt(process.env.MAX_TOKENS || '1024'),
        });

      case 'openrouter':
        return new OpenRouterAPI({
          apiKey: process.env.OPENROUTER_API_KEY || '',
          apiBase: process.env.OPENROUTER_API_BASE,
          model: process.env.OPENROUTER_MODEL,
          maxHistory: parseInt(process.env.MAX_HISTORY || '5'),
          maxTokens: parseInt(process.env.MAX_TOKENS || '1024'),
        });

      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }

  static getSupportedModels(): ModelType[] {
    return [...SUPPORTED_MODELS];
  }

  static hasAPIKey(model: ModelType): boolean {
    switch (model) {
      case 'openai':
        return !!(process.env.OPENAI_API_KEY);
      case 'openrouter':
        return !!(process.env.OPENROUTER_API_KEY);
      default:
        return false;
    }
  }
}