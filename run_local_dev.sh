#!/bin/bash

# Run MAVProxy locally for development

echo "Starting MAVProxy WebUI in development mode..."
echo ""
echo "This will start both the frontend (React) and backend (Flask) services."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

echo -e "${BLUE}Installing backend dependencies...${NC}"
pip install -q -r api/requirements.txt

# Start backend in background
echo -e "${BLUE}Starting backend (Flask) on http://localhost:5000${NC}"
cd api
python3 -c "
import sys
sys.path.insert(0, '..')
from index import app
app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
" &
BACKEND_PID=$!

# Give backend time to start
sleep 2

# Start frontend in background
echo -e "${BLUE}Starting frontend (Vite) on http://localhost:5173${NC}"
cd "$SCRIPT_DIR/webui-react"
npm install -q 2>/dev/null || true
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✅ MAVProxy is running!${NC}"
echo ""
echo "Frontend:  ${BLUE}http://localhost:5173${NC}"
echo "Backend:   ${BLUE}http://localhost:5000${NC}"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set trap to cleanup on exit
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
