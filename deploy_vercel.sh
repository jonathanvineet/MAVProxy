#!/bin/bash
# Deploy backend and frontend to Vercel separately

set -e

echo "======================================"
echo "MAVProxy Vercel Deployment Script"
echo "======================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI not found. Install it with: npm install -g vercel${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 1: Deploy Backend${NC}"
echo "---------------------------------------"
cd api
echo "Deploying Python Flask backend..."
vercel --prod

echo ""
echo -e "${GREEN}✅ Backend deployed!${NC}"
echo -e "${YELLOW}📋 Copy the backend URL from above${NC}"
echo ""

read -p "Enter the backend URL (e.g., https://your-backend.vercel.app): " BACKEND_URL

if [ -z "$BACKEND_URL" ]; then
    echo -e "${RED}❌ Backend URL is required${NC}"
    exit 1
fi

# Update root vercel.json with backend URL
cd ..
echo ""
echo -e "${YELLOW}Step 2: Update Frontend Configuration${NC}"
echo "---------------------------------------"
echo "Updating vercel.json with backend URL: ${BACKEND_URL}/api"

# Use perl for cross-platform sed alternative
perl -i -pe "s|\"VITE_API_URL\": \".*\"|\"VITE_API_URL\": \"${BACKEND_URL}/api\"|" vercel.json

echo ""
echo -e "${YELLOW}Step 3: Deploy Frontend${NC}"
echo "---------------------------------------"
echo "Deploying React frontend..."
vercel --prod

echo ""
echo -e "${GREEN}✅ Frontend deployed!${NC}"
echo ""
echo "======================================"
echo -e "${GREEN}🚀 Deployment Complete!${NC}"
echo "======================================"
echo ""
echo "Your application is now live:"
echo "- Backend API: ${BACKEND_URL}"
echo "- Frontend: (URL shown above)"
echo ""
