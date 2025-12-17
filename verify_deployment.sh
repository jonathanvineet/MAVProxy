#!/bin/bash
# Verify Vercel deployment - test CORS and API endpoints

set -e

echo "======================================"
echo "MAVProxy Vercel Deployment Verification"
echo "======================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

read -p "Enter backend URL (e.g., https://mavproxy-backend.vercel.app): " BACKEND_URL
read -p "Enter frontend URL (e.g., https://mavproxy-frontend.vercel.app): " FRONTEND_URL

if [ -z "$BACKEND_URL" ] || [ -z "$FRONTEND_URL" ]; then
    echo -e "${RED}❌ URLs required${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Testing Backend...${NC}"
echo "=================================================="

# Test 1: Health check
echo -n "1. Health check: "
RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC}"
    echo "   Response: $BODY"
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
fi

# Test 2: CORS preflight
echo -n "2. CORS preflight: "
RESPONSE=$(curl -s -i -X OPTIONS \
  -H "Origin: $FRONTEND_URL" \
  -H "Access-Control-Request-Method: POST" \
  "$BACKEND_URL/api/upload_chunk" 2>&1 | grep -i "Access-Control-Allow-Origin" | head -1)

if echo "$RESPONSE" | grep -q "*"; then
    echo -e "${GREEN}✅ OK${NC}"
    echo "   Header: $RESPONSE"
else
    echo -e "${YELLOW}⚠️ CHECK${NC}"
    echo "   Header: $RESPONSE"
fi

# Test 3: API graphs endpoint
echo -n "3. API /graphs endpoint: "
RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/graphs")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC}"
    COUNT=$(echo "$BODY" | grep -o '"name"' | wc -l)
    echo "   Graphs loaded: $COUNT"
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
fi

echo ""
echo -e "${BLUE}Testing Frontend...${NC}"
echo "=================================================="

# Test 4: Frontend is accessible
echo -n "4. Frontend accessible: "
RESPONSE=$(curl -s -w "\n%{http_code}" "$FRONTEND_URL")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
fi

# Test 5: Frontend has correct API URL
echo -n "5. Frontend environment: "
RESPONSE=$(curl -s "$FRONTEND_URL" | grep -o "VITE_API_URL" | wc -l)

if [ "$RESPONSE" -gt 0 ]; then
    echo -e "${GREEN}✅ Configured${NC}"
else
    echo -e "${YELLOW}⚠️ CHECK${NC}"
fi

echo ""
echo "======================================"
echo -e "${GREEN}✅ Verification Complete${NC}"
echo "======================================"
echo ""
echo "Next Steps:"
echo "1. Visit: $FRONTEND_URL"
echo "2. Upload a .bin file"
echo "3. Check browser Network tab for:"
echo "   - OPTIONS request to /api/upload_chunk → 200"
echo "   - POST request to /api/upload_chunk → 200"
echo ""
echo "If CORS errors persist:"
echo "1. Hard refresh: Ctrl+Shift+Delete"
echo "2. Redeploy: cd api && vercel --prod"
echo "3. Check Vercel logs in dashboard"
echo ""
