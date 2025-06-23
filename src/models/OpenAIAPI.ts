import { OpenAI } from 'openai';
import { ChatHistory } from '../utils/ChatHistory.js';
import { AIModelAPI, OpenAIConfig, ChatMessage } from '../types/index.js';

export class OpenAIAPI implements AIModelAPI {
  private client: OpenAI;
  private history: ChatHistory;
  private model: string;
  private maxTokens: number;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiBase || 'https://api.openai.com/v1',
    });
    
    this.model = config.model || 'gpt-4-turbo-preview';
    this.history = new ChatHistory(config.maxHistory || 5);
    this.maxTokens = config.maxTokens || 1024;
  }

  async send(text: string): Promise<string> {
    const newMessage: ChatMessage = { role: 'user', content: text };
    this.history.append(newMessage);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.history.getMessages(),
        max_tokens: this.maxTokens,
      });

      const assistantMessage = response.choices[0]?.message?.content;
      if (!assistantMessage) {
        throw new Error('No response from OpenAI API');
      }

      this.history.append({ role: 'assistant', content: assistantMessage });
      return assistantMessage.trim();
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  clearHistory(): void {
    this.history.clear();
  }
}