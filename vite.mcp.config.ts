import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        'mcp-server': resolve(__dirname, 'src/mcp-server.ts'),
        'mcp-docker-proxy': resolve(__dirname, 'src/mcp-docker-proxy.ts'),
        'mcp-workspace-server': resolve(__dirname, 'src/mcp-workspace-server.ts'),
        'telegram-mcp-webhook-server': resolve(__dirname, 'src/telegram-mcp-webhook-server.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@modelcontextprotocol/sdk',
        'telegraf',
        'axios',
        'express',
        'cors',
        'ws',
        'commander',
        'dotenv',
        'zod',
        'openai',
        'qrcode',
        'fs',
        'fs/promises',
        'path',
        'url',
        'crypto',
        'os',
        'child_process',
        'util',
        'events',
        'readline',
        'http',
        'https',
        'stream',
      ],
    },
    target: 'node18',
    outDir: 'dist/mcp',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
})