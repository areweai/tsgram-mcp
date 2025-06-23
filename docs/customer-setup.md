# Hermes MCP Customer Setup Guide

## Using Hermes MCP as a Remote Service (SaaS)

### Prerequisites
- Claude Pro, Max, Team, or Enterprise plan
- Claude Desktop or Claude Code (latest version June 2025)

## Configuration Methods

### Method 1: Claude Desktop Integrations UI (Recommended)

1. Open Claude Desktop
2. Go to **Settings** → **Integrations**
3. Click **Add Custom Integration**
4. Enter your Hermes MCP URL: `https://customer-id.hermes-mcp.com/mcp`
5. Complete OAuth authentication flow
6. Grant permissions for AI model access

### Method 2: Claude Code Remote MCP

```bash
# Register remote Hermes MCP server
claude mcp add hermes-saas https://customer-id.hermes-mcp.com/mcp

# With authentication (if required)
claude mcp add hermes-saas https://customer-id.hermes-mcp.com/mcp --auth oauth

# Test connection
claude mcp list
```

### Method 3: mcp-remote Proxy (Fallback)

If direct remote connection doesn't work, use the proxy:

```json
{
  "mcpServers": {
    "hermes-remote": {
      "command": "npx",
      "args": [
        "mcp-remote", 
        "https://customer-id.hermes-mcp.com/sse"
      ],
      "env": {
        "HERMES_API_KEY": "your-customer-api-key"
      }
    }
  }
}
```

## Available Tools

Once connected, customers can use:

- `hermes__chat_with_ai` - Chat with OpenAI or OpenRouter models
- `hermes__list_ai_models` - View available AI models
- `hermes__send_signal_message` - Send Signal messages (if configured)

## Usage Examples

### In Claude Desktop:
```
@hermes chat with OpenRouter: "Explain TypeScript interfaces"
@hermes list available models
@hermes send Signal message to +1234567890: "Meeting reminder"
```

### In Claude Code:
```
Use hermes to chat with AI about this code
Ask hermes to list available models
Have hermes send a Signal notification
```

## Customer-Specific Configuration

### Environment Variables (Per Customer)
```env
# Customer-specific API keys
CUSTOMER_OPENAI_API_KEY=sk-proj-customer-specific-key
CUSTOMER_OPENROUTER_API_KEY=sk-or-customer-specific-key

# Customer-specific settings
CUSTOMER_ID=customer-unique-id
CUSTOMER_SIGNAL_PHONE=+1234567890
CUSTOMER_WHITELIST_PHONES=+1111111111,+2222222222

# Rate limiting
CUSTOMER_RATE_LIMIT=100
CUSTOMER_MODEL_ACCESS=openai,openrouter
```

### Multi-Tenant URLs
```
https://customer1.hermes-mcp.com/mcp
https://customer2.hermes-mcp.com/mcp
https://enterprise.hermes-mcp.com/mcp
```

## Authentication Flows

### OAuth 2.0 (Recommended)
1. Customer clicks "Connect Hermes MCP"
2. Redirected to OAuth authorization
3. Grant permissions for specific models
4. Receive scoped access token
5. Claude connects automatically

### API Key (Simple)
1. Customer receives API key from dashboard
2. Configure in Claude with custom headers:
   ```
   Authorization: Bearer your-api-key
   X-Customer-ID: your-customer-id
   ```

## Troubleshooting

### Connection Issues
- Verify Claude plan supports remote MCP
- Check firewall/network restrictions
- Ensure HTTPS and valid SSL certificate
- Test direct API endpoints first

### Authentication Problems
- Clear Claude cache and re-authenticate
- Verify API key hasn't expired
- Check OAuth scope permissions
- Use mcp-remote as fallback

### Performance Issues
- Check rate limiting settings
- Monitor customer usage quotas
- Verify model API key validity
- Review server logs for errors

## Support

- API Documentation: `https://customer-id.hermes-mcp.com/docs`
- Health Check: `https://customer-id.hermes-mcp.com/health`
- Status Page: `https://status.hermes-mcp.com`
- Support: support@hermes-mcp.com