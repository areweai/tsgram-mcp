import { z } from 'zod'

// Telegram Bot API Response Schema
export const TelegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown(),
  description: z.string().optional(),
  error_code: z.number().optional(),
})

// Channel/Chat Schemas
export const ChatSchema = z.object({
  id: z.number(),
  type: z.enum(['private', 'group', 'supergroup', 'channel']),
  title: z.string().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  description: z.string().optional(),
  invite_link: z.string().optional(),
  pinned_message: z.object({
    message_id: z.number(),
    text: z.string().optional(),
  }).optional(),
})

export const MessageSchema = z.object({
  message_id: z.number(),
  from: z.object({
    id: z.number(),
    is_bot: z.boolean(),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
  }).optional(),
  chat: ChatSchema,
  date: z.number(),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(z.object({
    file_id: z.string(),
    file_unique_id: z.string(),
    width: z.number(),
    height: z.number(),
    file_size: z.number().optional(),
  })).optional(),
  video: z.object({
    file_id: z.string(),
    file_unique_id: z.string(),
    width: z.number(),
    height: z.number(),
    duration: z.number(),
    thumbnail: z.object({
      file_id: z.string(),
      file_unique_id: z.string(),
      width: z.number(),
      height: z.number(),
    }).optional(),
    file_size: z.number().optional(),
  }).optional(),
})

// Channel Management Schemas
export const CreateChannelSchema = z.object({
  title: z.string().min(1).max(128),
  description: z.string().max(255).optional(),
  username: z.string().optional(),
  is_private: z.boolean().default(false),
})

export const PostContentSchema = z.object({
  chat_id: z.union([z.string(), z.number()]),
  text: z.string().optional(),
  photo: z.string().optional(),
  video: z.string().optional(),
  caption: z.string().optional(),
  parse_mode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional(),
  disable_notification: z.boolean().optional(),
  reply_to_message_id: z.number().optional(),
})

// Story Schemas (2025 features)
export const PostStorySchema = z.object({
  chat_id: z.union([z.string(), z.number()]),
  media: z.object({
    type: z.enum(['photo', 'video']),
    media: z.string(),
    caption: z.string().optional(),
  }),
  duration: z.number().min(1).max(86400).optional(),
  privacy_settings: z.object({
    type: z.enum(['public', 'contacts', 'close_friends', 'selected_users']),
    user_ids: z.array(z.number()).optional(),
  }).optional(),
})

// Bot Configuration Schema
export const BotConfigSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  webhook_url: z.string().url().optional(),
  allowed_updates: z.array(z.string()).optional(),
  drop_pending_updates: z.boolean().default(false),
})

// Export TypeScript types
export type TelegramResponse = z.infer<typeof TelegramResponseSchema>
export type Chat = z.infer<typeof ChatSchema>
export type Message = z.infer<typeof MessageSchema>
export type CreateChannelRequest = z.infer<typeof CreateChannelSchema>
export type PostContentRequest = z.infer<typeof PostContentSchema>
export type PostStoryRequest = z.infer<typeof PostStorySchema>
export type BotConfig = z.infer<typeof BotConfigSchema>

// MCP Tool Result Schemas
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
})

export type ToolResult = z.infer<typeof ToolResultSchema>