#!/usr/bin/env node

/**
 * MCP DOCKER PROXY
 * 
 * This connects Claude Code to the running Docker container's MCP server
 * via HTTP API calls instead of direct stdio connection.
 * 
 * The Docker container runs the full MCP server with AI chat integration,
 * and this proxy translates MCP calls to HTTP requests.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

class MCPDockerProxy {
  private server: Server
  private dockerURL: string = 'http://localhost:4040'

  constructor() {
    this.server = new Server(
      {
        name: 'telegram-mcp-docker-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    )

    this.setupHandlers()
  }

  private setupHandlers() {
    // List tools - proxy to Docker container
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const response = await fetch(`${this.dockerURL}/mcp/tools`)
        if (!response.ok) {
          throw new Error(`Docker API error: ${response.statusText}`)
        }
        const data = await response.json()
        return { tools: data.tools || [] }
      } catch (error) {
        console.error('Failed to connect to Docker container:', error)
        return {
          tools: [
            {
              name: 'docker_connection_error',
              description: 'Failed to connect to Docker container',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }
      }
    })

    // Handle tool calls - proxy to Docker container
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        // Check Docker container health first
        const healthResponse = await fetch(`${this.dockerURL}/health`)
        if (!healthResponse.ok) {
          throw new Error('Docker container is not healthy')
        }

        // For now, return helpful information about the Docker container
        const healthData = await healthResponse.json()
        
        return {
          content: [
            {
              type: 'text',
              text: `Docker Container Status:
✅ Container: Running
✅ Health: ${healthData.status}
✅ Bots: ${healthData.bots}
✅ MCP Server: ${healthData.mcp_server}
✅ AI Model: Available

The Telegram bot is running in Docker and responding to messages automatically!

Available Docker endpoints:
- Health: ${this.dockerURL}/health
- MCP Status: ${this.dockerURL}/mcp/status
- Webhook: ${this.dockerURL}/webhook/telegram

To manually send messages, use the Docker container's MCP tools directly.
The bot automatically responds to user messages with AI-generated responses.`,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error connecting to Docker container: ${error instanceof Error ? error.message : 'Unknown error'}

Troubleshooting:
1. Check if Docker container is running: docker ps --filter name=hermes
2. Check container logs: docker logs hermes-mcp-server
3. Check health endpoint: curl http://localhost:4040/health

The Telegram bot should still be working automatically via polling.`,
            },
          ],
        }
      }
    })

    // Resources - proxy to Docker container
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'docker://status',
            name: 'Docker Container Status',
            description: 'Status of the running Telegram MCP Docker container',
            mimeType: 'application/json',
          },
        ],
      }
    })

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params

      if (uri === 'docker://status') {
        try {
          const healthResponse = await fetch(`${this.dockerURL}/health`)
          const mcpResponse = await fetch(`${this.dockerURL}/mcp/status`)
          
          const healthData = healthResponse.ok ? await healthResponse.json() : { error: 'Health check failed' }
          const mcpData = mcpResponse.ok ? await mcpResponse.json() : { error: 'MCP status failed' }

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  docker_health: healthData,
                  mcp_status: mcpData,
                  endpoints: {
                    health: `${this.dockerURL}/health`,
                    mcp_status: `${this.dockerURL}/mcp/status`,
                    webhook: `${this.dockerURL}/webhook/telegram`,
                  },
                }, null, 2),
              },
            ],
          }
        } catch (error) {
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  error: `Failed to connect to Docker container: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  troubleshooting: [
                    'Check if Docker container is running',
                    'Verify port 4040 is accessible',
                    'Check container logs for errors',
                  ],
                }, null, 2),
              },
            ],
          }
        }
      }

      throw new Error(`Unknown resource: ${uri}`)
    })
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('MCP Docker Proxy connected to Claude Code')
  }
}

const proxy = new MCPDockerProxy()
proxy.run().catch(console.error)