# CORS & Deployment Troubleshooting

## Issue: CORS errors on Vercel deployment

**Error:** `No 'Access-Control-Allow-Origin' header is present on the requested resource`

### Root Cause
- Vercel serverless functions need explicit CORS configuration
- Frontend and backend are on different domains
- Preflight OPTIONS requests must be handled

### Solutions Implemented

#### 1. Backend Configuration (/api/vercel.json)
Added explicit CORS headers to route configuration:
```json
"headers": {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE,PATCH",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
}
```

#### 2. Flask App Configuration (/api/index.py)
- Enhanced flask-cors setup with explicit options
- Added automatic preflight request handling
- Added `Vary: Origin` header for proper caching
- Better handling of OPTIONS requests

#### 3. Frontend Environment (/vercel.json)
Ensures correct backend URL is set during build:
```json
"VITE_API_URL": "https://mavproxy-backend.vercel.app/api"
```

## Deployment Steps to Fix CORS

### For Backend
```bash
cd api
git add -A
git commit -m "Fix CORS headers for Vercel deployment"
vercel --prod
```

### For Frontend
```bash
cd webui-react
# Make sure vercel.json in root has correct backend URL
git add -A
git commit -m "Update backend URL in Vercel config"
vercel --prod
```

## Verification

### 1. Check if backend is deployed
```bash
curl -i https://your-backend.vercel.app/health
```

Should return:
```
HTTP/2 200
Access-Control-Allow-Origin: *
Content-Type: application/json

{"status":"ok"}
```

### 2. Check OPTIONS preflight
```bash
curl -i -X OPTIONS https://your-backend.vercel.app/api/upload_chunk \
  -H "Origin: https://your-frontend.vercel.app" \
  -H "Access-Control-Request-Method: POST"
```

Should return:
```
HTTP/2 200
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,OPTIONS,PUT,DELETE,PATCH
```

### 3. Test from browser
1. Go to frontend URL
2. Upload a file
3. Check browser Network tab:
   - OPTIONS request should succeed (200)
   - POST request should succeed (200)

## Common Issues

### Backend returns 404
- Make sure vercel.json routes both `/api/(.*)` and `/(.*)` to index.py
- Deployed? Check: `vercel --list`

### Still getting CORS error
- Redeploy backend: `vercel --prod` from /api folder
- Clear browser cache and try again
- Check Vercel deployment logs for errors

### Frontend can't find backend
- Verify `VITE_API_URL` in vercel.json
- Rebuild frontend: `vercel --prod` from root

## Environment Variables

### Backend (Set in Vercel Dashboard)
- `SUPABASE_URL` (optional)
- `SUPABASE_KEY` (optional)

### Frontend (Set in vercel.json)
- `VITE_API_URL=https://your-backend.vercel.app/api`

## Quick Redeploy

```bash
# Redeploy everything
./deploy_vercel.sh

# Or manually:
# 1. Backend
cd api && vercel --prod

# 2. Frontend - update vercel.json first with new backend URL
vercel --prod
```

## Still Not Working?

1. **Check Vercel logs**
   - Dashboard > Project > Deployments > View Logs

2. **Test endpoint directly**
   ```bash
   # Should work without CORS issues
   curl -X POST https://your-backend.vercel.app/health
   ```

3. **Check frontend config**
   ```javascript
   // In browser console
   import.meta.env.VITE_API_URL
   ```

4. **Network tab analysis**
   - Look for OPTIONS request - should be 200
   - Look for actual request - should be 200
   - Check response headers for CORS headers

## Alternative: Deploy Backend Separately

If CORS issues persist on Vercel serverless:

### Option 1: Use Vercel with edge middleware
Create `/api/middleware.js`:
```javascript
export default function middleware(req) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const config = {
  matcher: ['/(.*?)'],
}
```

### Option 2: Use Render or Railway
- More suitable for Python backends
- Better file upload support
- No size limits like Vercel

```bash
# Deploy to Railway
railway up

# Deploy to Render
render deploy
```

## Notes

- Vercel serverless functions have 250MB unzip limit (we're at ~50MB)
- 4MB payload limit (we're chunking uploads)
- Cold starts may take 5-10 seconds on first request
- For production, consider dedicated backend on Railway/Render
