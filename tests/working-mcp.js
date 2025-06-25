#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ 
  name: "hermes-working", 
  version: "1.0.0" 
});

// Add a simple test tool
server.registerTool("test_hello", {
  title: "Test Hello Tool",
  description: "A simple test tool that says hello",
  inputSchema: z.object({
    name: z.string().optional().default("World")
  })
}, async ({ name }) => ({
  content: [{ 
    type: "text", 
    text: `Hello, ${name}! This is the Hermes MCP server working correctly.` 
  }]
}));

// Add OpenAI chat tool
server.registerTool("chat_openai", {
  title: "Chat with OpenAI",
  description: "Send a message to OpenAI GPT models",
  inputSchema: z.object({
    message: z.string().describe("Message to send to OpenAI"),
    model: z.string().optional().default("gpt-4").describe("OpenAI model to use")
  })
}, async ({ message, model }) => {
  try {
    // This would normally call OpenAI API
    return {
      content: [{ 
        type: "text", 
        text: `OpenAI ${model} response to "${message}": This is a placeholder response. To enable real OpenAI integration, add your API key to the environment.` 
      }]
    };
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error calling OpenAI: ${error.message}` 
      }]
    };
  }
});

// Add OpenRouter chat tool
server.registerTool("chat_openrouter", {
  title: "Chat with OpenRouter",
  description: "Send a message to AI models via OpenRouter",
  inputSchema: z.object({
    message: z.string().describe("Message to send to the AI model"),
    model: z.string().optional().default("anthropic/claude-3.5-sonnet").describe("Model to use via OpenRouter")
  })
}, async ({ message, model }) => {
  try {
    // This would normally call OpenRouter API
    return {
      content: [{ 
        type: "text", 
        text: `OpenRouter ${model} response to "${message}": This is a placeholder response. To enable real OpenRouter integration, add your API key to the environment.` 
      }]
    };
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error calling OpenRouter: ${error.message}` 
      }]
    };
  }
});

// Add a resource for configuration info
server.registerResource(
  "config",
  "hermes://config",
  {
    title: "Hermes Configuration",
    description: "Current server configuration and status"
  },
  async () => ({
    contents: [{
      uri: "hermes://config",
      mimeType: "application/json",
      text: JSON.stringify({
        name: "Hermes MCP Server",
        version: "1.0.0",
        status: "running",
        capabilities: ["chat_openai", "chat_openrouter", "test_hello"],
        timestamp: new Date().toISOString()
      }, null, 2)
    }]
  })
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
console.log("Hermes MCP Server is running and ready!");