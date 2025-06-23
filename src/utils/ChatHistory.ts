import { ChatMessage } from '../types/index.js';

export class ChatHistory {
  private messages: ChatMessage[] = [];
  private readonly maxMessages: number;

  constructor(maxMessages: number) {
    this.maxMessages = maxMessages;
  }

  append(message: ChatMessage): void {
    this.messages.push(message);
    
    // Keep only the last maxMessages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  getMessages(): ChatMessage[] {
    return [...this.messages]; // Return a copy to prevent external modifications
  }

  clear(): void {
    this.messages = [];
  }

  getLastMessage(): ChatMessage | null {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  getMessageCount(): number {
    return this.messages.length;
  }
}