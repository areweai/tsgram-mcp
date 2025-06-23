import { OpenAI } from 'openai';
import { ChatHistory } from '../utils/ChatHistory.js';
import { AIModelAPI, OpenRouterConfig, ChatMessage } from '../types/index.js';

export class OpenRouterAPI implements AIModelAPI {
  private client: OpenAI;
  private history: ChatHistory;
  private model: string;
  private maxTokens: number;

  constructor(config: OpenRouterConfig) {
    this.client = new OpenAI({
      baseURL: config.apiBase || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://tsgram.app',
        'X-Title': 'TSGram MCP',
      },
    });
    
    this.model = config.model || 'anthropic/claude-sonnet-4';
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
        temperature: 0.7,
      });

      const assistantMessage = response.choices[0]?.message?.content;
      if (!assistantMessage) {
        throw new Error('No response from OpenRouter API');
      }

      this.history.append({ role: 'assistant', content: assistantMessage });
      return assistantMessage.trim();
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw new Error(`OpenRouter API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  clearHistory(): void {
    this.history.clear();
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  // Get available models from OpenRouter
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.client.apiKey}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json() as { data?: Array<{ id: string }> };
      return data.data?.map((model) => model.id) || [];
    } catch (error) {
      console.warn('Could not fetch OpenRouter models:', error);
      return [
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-haiku',
        'openai/gpt-4-turbo',
        'openai/gpt-3.5-turbo',
        'meta-llama/llama-3.1-70b-instruct',
        'google/gemini-pro-1.5',
      ];
    }
  }
}