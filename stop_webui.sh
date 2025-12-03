#!/bin/bash

# MAVExplorer WebUI Stop Script
# This script stops both the Flask backend and Vite frontend servers

echo "🛑 Stopping MAVExplorer WebUI..."

if [ -f /tmp/mavexplorer_pids.txt ]; then
    while read pid; do
        if ps -p $pid > /dev/null 2>&1; then
            echo "   Killing process $pid"
            kill $pid
        else
            echo "   Process $pid not running"
        fi
    done < /tmp/mavexplorer_pids.txt
    rm /tmp/mavexplorer_pids.txt
    echo "✅ Stopped"
else
    echo "❌ PID file not found. Trying to kill by port..."
    
    # Kill processes on port 3030 (Flask)
    BACKEND_PID=$(lsof -ti:3030)
    if [ ! -z "$BACKEND_PID" ]; then
        echo "   Killing Flask backend (PID: $BACKEND_PID)"
        kill $BACKEND_PID
    fi
    
    # Kill processes on port 5173 (Vite)
    FRONTEND_PID=$(lsof -ti:5173)
    if [ ! -z "$FRONTEND_PID" ]; then
        echo "   Killing Vite frontend (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID
    fi
    
    echo "✅ Done"
fi
