#!/bin/bash

# Test API Keys Script
# Usage: ./scripts/test-api-keys.sh

set -e

echo "🔑 Testing API Keys Configuration"

# Load environment variables
source .env

echo ""
echo "📋 Configuration Status:"
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..." 
echo "OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:0:10}..."
echo ""

# Test OpenRouter API Key
echo "🧪 Testing OpenRouter API Key..."
if [ "$OPENROUTER_API_KEY" = "your_openrouter_api_key_here" ]; then
    echo "❌ OpenRouter API key is not configured (still using placeholder)"
else
    echo "🔍 Testing OpenRouter authentication..."
    OPENROUTER_TEST=$(curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" \
        "https://openrouter.ai/api/v1/auth/key")
    
    if echo "$OPENROUTER_TEST" | grep -q "error"; then
        echo "❌ OpenRouter API key is invalid"
        echo "   Response: $OPENROUTER_TEST"
        echo "   Please get a valid key from: https://openrouter.ai/keys"
    else
        echo "✅ OpenRouter API key is valid!"
        echo "   Response: $OPENROUTER_TEST"
    fi
fi

echo ""

# Test OpenAI API Key
echo "🧪 Testing OpenAI API Key..."
if [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    echo "❌ OpenAI API key is not configured (still using placeholder)"
else
    echo "🔍 Testing OpenAI authentication..."
    OPENAI_TEST=$(curl -s -H "Authorization: Bearer $OPENAI_API_KEY" \
        "https://api.openai.com/v1/models" | head -c 100)
    
    if echo "$OPENAI_TEST" | grep -q "error"; then
        echo "❌ OpenAI API key is invalid"
        echo "   Please get a valid key from: https://platform.openai.com/api-keys"
    else
        echo "✅ OpenAI API key is valid!"
    fi
fi

echo ""
echo "🎯 Next Steps:"

if [ "$OPENROUTER_API_KEY" != "your_openrouter_api_key_here" ] && ! echo "$OPENROUTER_TEST" | grep -q "error"; then
    echo "✅ You can test OpenRouter models:"
    echo "   npm run cli -- test -m openrouter -t 'Hello, world!'"
    echo "   npm start  # Start the bot with OpenRouter as default"
fi

if [ "$OPENAI_API_KEY" != "your_openai_api_key_here" ] && ! echo "$OPENAI_TEST" | grep -q "error"; then
    echo "✅ You can test OpenAI models:"
    echo "   npm run cli -- test -m openai -t 'Hello, world!'"
fi

echo ""
echo "🔧 To fix invalid keys:"
echo "1. Get OpenRouter key: https://openrouter.ai/keys"
echo "2. Get OpenAI key: https://platform.openai.com/api-keys"
echo "3. Update .env file with valid keys"
echo "4. Run this script again to verify"