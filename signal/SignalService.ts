import { SignalBotContext, ModelType } from '../types/index.js';
import { ChatModel } from '../models/index.js';

export class SignalService {
  private models: Map<ModelType, ChatModel> = new Map();
  private triggers: Map<string, ChatModel> = new Map();
  private disabledModels: Set<string>;
  private defaultModel?: string;

  constructor() {
    this.disabledModels = new Set(
      (process.env.DISABLED_MODELS || '').toLowerCase().split(',').filter(Boolean)
    );
    this.defaultModel = process.env.DEFAULT_MODEL?.toLowerCase();
    
    this.initializeModels();
  }

  private initializeModels(): void {
    const availableModels = ChatModel.getAvailableModels();
    
    for (const modelType of availableModels) {
      if (!this.disabledModels.has(modelType)) {
        try {
          const chatModel = new ChatModel(modelType);
          this.models.set(modelType, chatModel);
          this.triggers.set(chatModel.trigger, chatModel);
          console.log(`Initialized model: ${modelType} with trigger: ${chatModel.trigger}`);
        } catch (error) {
          console.error(`Failed to initialize model ${modelType}:`, error);
        }
      }
    }
  }

  async handleMessage(ctx: SignalBotContext): Promise<void> {
    const message = ctx.message;
    const text = message.getBody();

    if (!text) {
      return;
    }

    let response = '';
    let modelUsed: ChatModel | undefined;

    // Check for trigger words
    for (const [trigger, model] of this.triggers) {
      if (text.startsWith(trigger)) {
        const triggerModel = trigger.replace('!', '');
        if (!this.disabledModels.has(triggerModel)) {
          try {
            await message.markRead();
            await message.typingStarted();
            
            const prompt = text.slice(trigger.length).trim();
            if (prompt) {
              response = await model.api.send(prompt);
              modelUsed = model;
            }
          } catch (error) {
            console.error(`Error with model ${model.model}:`, error);
            response = `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
          break;
        }
      }
    }

    // If no trigger matched, try default model
    if (!response && this.defaultModel) {
      const defaultTrigger = `!${this.defaultModel}`;
      const defaultModelInstance = this.triggers.get(defaultTrigger);
      
      if (defaultModelInstance) {
        try {
          await message.markRead();
          await message.typingStarted();
          response = await defaultModelInstance.api.send(text);
          modelUsed = defaultModelInstance;
        } catch (error) {
          console.error(`Error with default model ${this.defaultModel}:`, error);
          response = `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    }

    // Send response if we have one
    if (response) {
      try {
        await message.typingStopped();
        
        // Quote the original message in group chats
        const quote = message.getGroupId() !== null;
        await message.reply(response, { quote });
        
        console.log(`Response sent using model: ${modelUsed?.model || 'unknown'}`);
      } catch (error) {
        console.error('Error sending response:', error);
      }
    }
  }

  getAvailableModels(): string[] {
    return Array.from(this.models.keys());
  }

  getModelInfo(): Array<{ model: string; trigger: string; enabled: boolean }> {
    return ChatModel.getAvailableModels().map(model => ({
      model,
      trigger: `!${model}`,
      enabled: !this.disabledModels.has(model)
    }));
  }
}