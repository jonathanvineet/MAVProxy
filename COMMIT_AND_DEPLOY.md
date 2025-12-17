# Vercel Deployment - Commit & Deploy Instructions

## What Changed

### Fixed Files
1. **`/api/vercel.json`** - Simplified Flask routing for proper CORS
2. **`/vercel.json`** - Updated to use `VITE_API_URL` without `/api` suffix
3. **`/api/index.py`** - Enhanced Flask CORS middleware
4. **`/webui-react/src/api.js`** - Auto-adds `/api` to backend URL

### New Files
- `VERCEL_DEPLOY.md` - Step-by-step deployment guide
- `verify_deployment.sh` - Automated verification script
- This file

## Step 1: Commit Changes

```bash
git add api/vercel.json vercel.json api/index.py webui-react/src/api.js
git commit -m "fix: Resolve CORS errors in Vercel deployment

- Fix backend vercel.json routing for Flask CORS middleware
- Update frontend API URL configuration
- Enhance Flask CORS headers for all responses
- Auto-add /api path in API client for frontend/backend URL compatibility

Fixes: CORS 'No Access-Control-Allow-Origin header' error on Vercel"

git push origin main
```

## Step 2: Deploy Backend

```bash
cd api
vercel --prod
```

**Save the URL** displayed (e.g., `https://mavproxy-backend-xyz.vercel.app`)

## Step 3: Update Frontend Config

Edit `/vercel.json` and set the backend URL:

```json
{
  "env": {
    "VITE_API_URL": "https://your-backend-url-here.vercel.app"
  }
}
```

Then commit:
```bash
git add vercel.json
git commit -m "chore: Update backend URL for production deployment"
git push
```

## Step 4: Deploy Frontend

```bash
vercel --prod
```

**Save the URL** displayed (e.g., `https://mavproxy-frontend-xyz.vercel.app`)

## Step 5: Verify Deployment

```bash
./verify_deployment.sh
```

Follow the prompts to test:
- Backend health check
- CORS preflight requests
- API endpoints
- Frontend accessibility

## What Should Happen

1. ✅ Backend deploys to `https://your-backend.vercel.app`
2. ✅ Frontend builds with backend URL in environment
3. ✅ Frontend deploys to `https://your-frontend.vercel.app`
4. ✅ CORS headers are sent from backend
5. ✅ File upload works without CORS errors

## Quick Test (Manual)

```bash
# Test backend
curl https://your-backend.vercel.app/health

# Test CORS
curl -i -X OPTIONS \
  -H "Origin: https://your-frontend.vercel.app" \
  https://your-backend.vercel.app/api/upload_chunk

# Should see:
# HTTP/2 200
# Access-Control-Allow-Origin: *
```

## If Still Getting CORS Errors

1. **Hard refresh browser**
   - Windows/Linux: Ctrl + Shift + Delete
   - Mac: Cmd + Shift + Delete

2. **Clear Next.js/Vite cache**
   ```bash
   rm -rf webui-react/.next
   rm -rf webui-react/dist
   ```

3. **Redeploy backend**
   ```bash
   cd api && vercel --prod
   ```

4. **Check Vercel logs**
   - Go to Vercel Dashboard
   - Click on deployment
   - View build and runtime logs

5. **Verify environment variable**
   ```javascript
   // In browser console:
   // Should show backend URL
   import.meta.env.VITE_API_URL
   ```

## Key Points

- ✅ CORS is handled by Flask app, not Vercel config headers
- ✅ API client automatically adds `/api` to backend URL
- ✅ Both servers run independently on Vercel
- ✅ File upload works with chunking (3.5MB chunks)
- ✅ No 250MB limit issues - backend is only ~50MB

## Documentation

See:
- `VERCEL_DEPLOY.md` - Detailed deployment steps
- `CORS_TROUBLESHOOTING.md` - CORS debugging guide
- `DEPLOYMENT.md` - Alternative deployment strategies
