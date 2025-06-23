export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatHistoryOptions {
  maxMessages: number;
}

export interface AIModelConfig {
  model: string;
  trigger: string;
  api: AIModelAPI;
}

export interface AIModelAPI {
  send(text: string): Promise<string>;
}

export interface OpenAIConfig {
  apiKey: string;
  apiBase?: string;
  model?: string;
  maxHistory?: number;
  maxTokens?: number;
}

export interface OpenRouterConfig {
  apiKey: string;
  apiBase?: string;
  model?: string;
  maxHistory?: number;
  maxTokens?: number;
}

export type ModelType = 'openai' | 'openrouter';

export const SUPPORTED_MODELS: ModelType[] = ['openai', 'openrouter'];

export interface SignalMessage {
  getBody(): string;
  getGroupId(): string | null;
  markRead(): Promise<void>;
  typingStarted(): Promise<void>;
  typingStopped(): Promise<void>;
  reply(text: string, options?: { quote?: boolean }): Promise<void>;
}

export interface SignalBotContext {
  message: SignalMessage;
  data: Record<string, any>;
}