# Proposed Features for Signal AI Chat Bot

This document outlines planned enhancements and new features for the Signal AI Chat Bot. These features are organized by priority and development complexity.

---

## 🏆 Core Features (High Priority)

### 1. Group Chat Support with Phone Number Whitelist

**Status**: 📋 Proposed  
**Priority**: High  
**Complexity**: Medium  

#### Overview
Enable the bot to automatically join and participate in Signal group chats when invited by whitelisted phone numbers. This allows trusted users to create group conversations that include the AI bot.

#### Detailed Requirements

**Whitelist Management**
- Maintain a configurable list of authorized phone numbers
- Only users on the whitelist can invite the bot to groups
- Support for adding/removing numbers via configuration or admin commands
- Format: International format (+1234567890)

**Group Join Behavior**
- Automatically accept group invitations from whitelisted numbers
- Decline invitations from non-whitelisted numbers (with optional notification)
- Join existing groups when a whitelisted user adds the bot
- Maintain group membership until explicitly removed

**Group Message Handling**
- Respond to direct mentions (@bot_name or equivalent)
- Respond to trigger commands (!openai, !openrouter) from any group member
- Optionally respond to general questions (configurable per group)
- Quote original messages in busy group chats for context

#### Technical Implementation

**Configuration**
```env
# Group Chat Configuration
WHITELIST_PHONE_NUMBERS=+1234567890,+0987654321,+5555551234
GROUP_AUTO_JOIN=true
GROUP_MENTION_REQUIRED=true
GROUP_TRIGGERS_ENABLED=true
GROUP_GENERAL_RESPONSES=false
```

**Code Structure**
```typescript
// src/services/GroupChatService.ts
export class GroupChatService {
  private whitelist: Set<string>;
  private groupSettings: Map<string, GroupSettings>;
  
  constructor(whitelistNumbers: string[]) {
    this.whitelist = new Set(whitelistNumbers);
  }
  
  shouldJoinGroup(inviterNumber: string): boolean {
    return this.whitelist.has(inviterNumber);
  }
  
  handleGroupInvitation(invitation: GroupInvitation): Promise<boolean> {
    if (this.shouldJoinGroup(invitation.inviter)) {
      return this.acceptInvitation(invitation);
    } else {
      return this.declineInvitation(invitation);
    }
  }
  
  shouldRespondInGroup(message: GroupMessage): boolean {
    // Check if bot is mentioned, has trigger, or general responses enabled
    return this.isMentioned(message) || 
           this.hasTrigger(message) || 
           this.groupSettings.get(message.groupId)?.generalResponses;
  }
}
```

**Message Processing**
```typescript
// Enhanced SignalService for group support
export class SignalService {
  private groupChatService: GroupChatService;
  
  async handleMessage(ctx: SignalBotContext): Promise<void> {
    const message = ctx.message;
    
    if (message.getGroupId()) {
      // Group message handling
      if (!this.groupChatService.shouldRespondInGroup(message)) {
        return; // Don't respond to this group message
      }
      
      // Process with group-specific settings
      await this.handleGroupMessage(ctx);
    } else {
      // Direct message handling (existing logic)
      await this.handleDirectMessage(ctx);
    }
  }
  
  private async handleGroupMessage(ctx: SignalBotContext): Promise<void> {
    const groupId = ctx.message.getGroupId();
    const settings = this.groupChatService.getGroupSettings(groupId);
    
    // Use group-specific configuration
    const response = await this.processAIMessage(ctx, settings);
    
    if (response) {
      // Always quote in group chats for context
      await ctx.message.reply(response, { quote: true });
    }
  }
}
```

#### Configuration Options

**Whitelist Management**
```typescript
interface WhitelistConfig {
  phoneNumbers: string[];          // List of authorized numbers
  autoJoin: boolean;              // Auto-join groups from whitelist
  notifyDeclined: boolean;        // Notify when declining invitations
  adminNumbers?: string[];        // Numbers that can modify whitelist
}
```

**Group-Specific Settings**
```typescript
interface GroupSettings {
  groupId: string;
  generalResponses: boolean;      // Respond to non-trigger messages
  mentionRequired: boolean;       // Require @mention for responses
  triggersEnabled: boolean;       // Allow !openai, !openrouter commands
  maxHistory: number;            // Group conversation history limit
  preferredModel: string;        // Default AI model for this group
  adminOnly: boolean;            // Only respond to group admins
}
```

#### User Experience

**For Whitelisted Users**
1. Create a Signal group
2. Add the bot's phone number to the group
3. Bot automatically joins and sends welcome message
4. Group members can interact using triggers or mentions

**For Group Members**
```
# Trigger examples in group chat
User: !openai What is machine learning?
Bot: @User Machine learning is a subset of artificial intelligence...

User: @signal_bot_name explain quantum computing
Bot: @User Quantum computing is a revolutionary approach...

# General conversation (if enabled)
User: Does anyone know about Python programming?
Bot: @User I can help with Python programming questions!
```

**For Non-Whitelisted Users**
1. Attempt to add bot to group
2. Bot automatically leaves with optional message:
   "I can only join groups when invited by authorized users."

#### Security Considerations

**Access Control**
- Strict whitelist enforcement
- Group admin verification for sensitive commands
- Rate limiting per group and per user
- Audit logging of group joins/leaves

**Privacy Protection**
- Group conversation history isolated per group
- No cross-group information sharing
- Optional conversation encryption at rest
- Configurable data retention policies

#### Admin Commands

**Whitelist Management** (for admin numbers)
```
!admin whitelist add +1234567890
!admin whitelist remove +1234567890
!admin whitelist list
!admin group settings [groupId] general_responses true
!admin group settings [groupId] preferred_model openrouter
```

#### Implementation Phases

**Phase 1: Basic Group Support**
- Whitelist configuration and validation
- Group invitation acceptance/decline logic
- Basic group message handling with mentions

**Phase 2: Advanced Group Features**
- Group-specific settings management
- Admin commands for configuration
- Enhanced message routing and context

**Phase 3: Enterprise Features**
- Multi-level whitelist (organization-based)
- Group analytics and usage reporting
- Integration with group management tools

#### Testing Strategy

**Unit Tests**
- Whitelist validation logic
- Group invitation decision making
- Message routing for groups vs direct messages

**Integration Tests**
- Full group invitation flow
- Message handling in various group scenarios
- Admin command execution

**User Acceptance Tests**
- Whitelisted user creating groups with bot
- Non-whitelisted user attempting to add bot
- Group conversation flows with multiple users

#### Success Metrics

- Number of active groups with bot participation
- Response accuracy in group vs direct message contexts
- User satisfaction with group chat functionality
- Reduction in support requests about group features

---

## 🚀 Enhancement Features (Medium Priority)

### 2. Conversation Memory and Context Management

**Status**: 📋 Proposed  
**Priority**: Medium  
**Complexity**: Medium  

Allow the bot to maintain conversation context across multiple messages, enabling more natural and coherent conversations.

### 3. User Preferences and Personalization

**Status**: 📋 Proposed  
**Priority**: Medium  
**Complexity**: Low  

Enable users to set personal preferences for default AI models, response styles, and conversation settings.

### 4. Advanced AI Model Integration

**Status**: 📋 Proposed  
**Priority**: Medium  
**Complexity**: High  

Add support for additional AI providers and models, including local AI models and specialized task-specific models.

---

## 🔧 Technical Features (Low Priority)

### 5. Analytics and Usage Monitoring

**Status**: 📋 Proposed  
**Priority**: Low  
**Complexity**: Medium  

Implement comprehensive analytics to track usage patterns, model performance, and user engagement.

### 6. Multi-Language Support

**Status**: 📋 Proposed  
**Priority**: Low  
**Complexity**: High  

Add support for multiple languages in bot responses and commands.

### 7. Plugin Architecture

**Status**: 📋 Proposed  
**Priority**: Low  
**Complexity**: High  

Develop a plugin system allowing third-party extensions and custom functionality.

---

## 📱 Platform Extensions (Future)

### 8. Telegram Bot Integration (Planned)

**Status**: 📋 Documented in getting-started.md  
**Priority**: Medium  
**Complexity**: Medium  

Complete alternative implementation using Telegram's official Bot API.

### 9. Discord Bot Integration

**Status**: 📋 Proposed  
**Priority**: Low  
**Complexity**: Medium  

Extend the bot to support Discord servers and channels.

### 10. Slack App Integration

**Status**: 📋 Proposed  
**Priority**: Low  
**Complexity**: Medium  

Create a Slack app version for workplace integration.

---

## Status Legend

- 📋 **Proposed**: Feature documented and planned
- 🚧 **In Development**: Currently being implemented
- 🧪 **Testing**: Feature complete, undergoing testing
- ✅ **Complete**: Feature implemented and deployed
- 🔄 **Iterating**: Feature deployed but being refined
- ❌ **Cancelled**: Feature no longer planned

---

## Contributing to Feature Development

If you'd like to contribute to any of these proposed features:

1. **Check the current status** in this document
2. **Review existing issues** on the GitHub repository
3. **Create a feature branch** following the naming convention: `feature/[feature-name]`
4. **Follow the development guidelines** in the main README
5. **Submit a pull request** with comprehensive tests and documentation

For major features like group chat support, please create an issue first to discuss the implementation approach and coordinate with other contributors.