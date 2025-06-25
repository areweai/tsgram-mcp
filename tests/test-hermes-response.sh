#!/bin/bash

# Test if Hermes bot is responding

echo "Testing Hermes bot response..."

# Send a test message directly to the bot
curl -X POST http://localhost:4040/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 12345,
    "message": {
      "message_id": 54321,
      "date": 1234567890,
      "chat": {
        "id": 5988959818,
        "type": "private"
      },
      "from": {
        "id": 5988959818,
        "is_bot": false,
        "username": "duncist"
      },
      "text": ":h help"
    }
  }'

echo "Test message sent. Check Telegram for response."