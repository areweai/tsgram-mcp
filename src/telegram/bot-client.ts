import axios, { AxiosInstance } from 'axios'
import { z } from 'zod'
import {
  TelegramResponse,
  Chat,
  Message,
  CreateChannelRequest,
  PostContentRequest,
  PostStoryRequest,
  BotConfig,
  TelegramResponseSchema,
  ChatSchema,
  MessageSchema,
  ToolResult,
} from '../types/telegram.js'

export class TelegramBotClient {
  private api: AxiosInstance
  private botToken: string
  private config: BotConfig

  constructor(config: BotConfig) {
    this.config = config
    this.botToken = config.token
    this.api = axios.create({
      baseURL: `https://api.telegram.org/bot${this.botToken}`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  // Core API method wrapper
  private async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.api.post(`/${method}`, params)
      const result = TelegramResponseSchema.parse(response.data)
      
      if (!result.ok) {
        throw new Error(`Telegram API Error: ${result.description || 'Unknown error'}`)
      }
      
      return result.result as T
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`HTTP Error: ${error.response?.status} - ${error.response?.statusText}`)
      }
      throw error
    }
  }

  // Bot Information
  async getMe(): Promise<ToolResult> {
    try {
      const result = await this.apiCall('getMe')
      return {
        success: true,
        data: result,
        message: 'Bot information retrieved successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Channel Management
  async createChannel(params: CreateChannelRequest): Promise<ToolResult> {
    try {
      // Note: Bots cannot directly create channels via Bot API
      // This would require using Telegram Client API or manual creation
      return {
        success: false,
        error: 'Channel creation requires manual setup or Telegram Client API',
        message: 'Please create the channel manually and add the bot as administrator',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getChat(chatId: string | number): Promise<ToolResult> {
    try {
      const chat = await this.apiCall<Chat>('getChat', { chat_id: chatId })
      const validatedChat = ChatSchema.parse(chat)
      
      return {
        success: true,
        data: validatedChat,
        message: 'Chat information retrieved successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getChatAdministrators(chatId: string | number): Promise<ToolResult> {
    try {
      const admins = await this.apiCall('getChatAdministrators', { chat_id: chatId })
      return {
        success: true,
        data: admins,
        message: 'Chat administrators retrieved successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async setChatTitle(chatId: string | number, title: string): Promise<ToolResult> {
    try {
      await this.apiCall('setChatTitle', { chat_id: chatId, title })
      return {
        success: true,
        message: 'Chat title updated successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async setChatDescription(chatId: string | number, description: string): Promise<ToolResult> {
    try {
      await this.apiCall('setChatDescription', { chat_id: chatId, description })
      return {
        success: true,
        message: 'Chat description updated successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Message Management
  async sendMessage(params: PostContentRequest): Promise<ToolResult> {
    try {
      const message = await this.apiCall<Message>('sendMessage', params)
      const validatedMessage = MessageSchema.parse(message)
      
      return {
        success: true,
        data: validatedMessage,
        message: 'Message sent successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async sendPhoto(params: PostContentRequest): Promise<ToolResult> {
    try {
      if (!params.photo) {
        throw new Error('Photo URL or file_id is required')
      }
      
      const message = await this.apiCall<Message>('sendPhoto', params)
      const validatedMessage = MessageSchema.parse(message)
      
      return {
        success: true,
        data: validatedMessage,
        message: 'Photo sent successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async sendVideo(params: PostContentRequest): Promise<ToolResult> {
    try {
      if (!params.video) {
        throw new Error('Video URL or file_id is required')
      }
      
      const message = await this.apiCall<Message>('sendVideo', params)
      const validatedMessage = MessageSchema.parse(message)
      
      return {
        success: true,
        data: validatedMessage,
        message: 'Video sent successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async pinChatMessage(chatId: string | number, messageId: number): Promise<ToolResult> {
    try {
      await this.apiCall('pinChatMessage', { 
        chat_id: chatId, 
        message_id: messageId,
        disable_notification: true 
      })
      return {
        success: true,
        message: 'Message pinned successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async unpinChatMessage(chatId: string | number, messageId?: number): Promise<ToolResult> {
    try {
      await this.apiCall('unpinChatMessage', { 
        chat_id: chatId, 
        message_id: messageId 
      })
      return {
        success: true,
        message: 'Message unpinned successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Story Management (2025 features)
  async postStory(params: PostStoryRequest): Promise<ToolResult> {
    try {
      // Note: Story API may not be fully available in Bot API yet
      // This is a future-ready implementation
      const story = await this.apiCall('postStory', params)
      return {
        success: true,
        data: story,
        message: 'Story posted successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Story posting may not be available yet',
      }
    }
  }

  // Message History
  async getUpdates(offset?: number, limit?: number): Promise<ToolResult> {
    try {
      const updates = await this.apiCall('getUpdates', { 
        offset, 
        limit: limit || 100,
        allowed_updates: this.config.allowed_updates 
      })
      return {
        success: true,
        data: updates,
        message: 'Updates retrieved successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getChatHistory(chatId: string | number, limit: number = 10): Promise<ToolResult> {
    try {
      // Get recent messages by finding the latest message and going backwards
      const updates = await this.getUpdates()
      if (!updates.success || !updates.data) {
        return updates
      }

      const messages = (updates.data as any[])
        .filter(update => update.message?.chat?.id.toString() === chatId.toString())
        .map(update => update.message)
        .slice(-limit)

      return {
        success: true,
        data: messages,
        message: `Retrieved ${messages.length} recent messages`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Webhook Management
  async setWebhook(url: string): Promise<ToolResult> {
    try {
      await this.apiCall('setWebhook', { 
        url,
        allowed_updates: this.config.allowed_updates,
        drop_pending_updates: this.config.drop_pending_updates 
      })
      return {
        success: true,
        message: 'Webhook set successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async deleteWebhook(): Promise<ToolResult> {
    try {
      await this.apiCall('deleteWebhook', { drop_pending_updates: true })
      return {
        success: true,
        message: 'Webhook deleted successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getWebhookInfo(): Promise<ToolResult> {
    try {
      const info = await this.apiCall('getWebhookInfo')
      return {
        success: true,
        data: info,
        message: 'Webhook info retrieved successfully',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}