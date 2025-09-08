#!/bin/bash

# Script to start the voice server with proper environment setup
# Usage: ./start-voice-server.sh

echo "Starting Voice Server for The Rug Café..."
echo "Make sure you have set your OPENAI_API_KEY environment variable"
echo ""

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ ERROR: OPENAI_API_KEY environment variable is not set"
    echo ""
    echo "Please set your OpenAI API key by running:"
    echo "export OPENAI_API_KEY=sk-your-actual-api-key-here"
    echo ""
    echo "Then run this script again:"
    echo "./start-voice-server.sh"
    exit 1
fi

echo "✅ OPENAI_API_KEY is set"
echo "🚀 Starting voice server on port 8787..."
echo ""

# Start the server
npm run voice:server
