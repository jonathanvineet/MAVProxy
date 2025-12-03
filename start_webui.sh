#!/bin/bash

# MAVExplorer WebUI Startup Script
# This script starts both the Flask backend and Vite frontend servers

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🚀 Starting MAVExplorer WebUI..."

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found. Please run: python -m venv .venv && source .venv/bin/activate && pip install -r server/requirements.txt"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "webui-react/node_modules" ]; then
    echo "❌ Node modules not found. Please run: cd webui-react && npm install"
    exit 1
fi

# Start Flask backend
echo "📡 Starting Flask backend server on port 3030..."
source .venv/bin/activate
nohup python -u server/analyze_server.py > /tmp/mavexplorer_backend.log 2>&1 < /dev/null &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 2

# Check if backend is running
if curl -s http://127.0.0.1:3030/api/ping > /dev/null 2>&1; then
    echo "✅ Backend server is running"
else
    echo "❌ Backend server failed to start. Check /tmp/mavexplorer_backend.log"
    exit 1
fi

# Start Vite frontend
echo "🎨 Starting Vite frontend server on port 5173..."
cd webui-react
nohup npm run dev > /tmp/mavexplorer_frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
cd ..

# Wait for frontend to start
sleep 3

echo ""
echo "✅ MAVExplorer WebUI is running!"
echo ""
echo "📍 Access the application at: http://127.0.0.1:5173"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f /tmp/mavexplorer_backend.log"
echo "   Frontend: tail -f /tmp/mavexplorer_frontend.log"
echo ""
echo "🛑 To stop the servers:"
echo "   kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "PIDs saved to /tmp/mavexplorer_pids.txt"
echo "$BACKEND_PID" > /tmp/mavexplorer_pids.txt
echo "$FRONTEND_PID" >> /tmp/mavexplorer_pids.txt
