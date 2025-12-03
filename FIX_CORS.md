# Fix CORS Issues - Quick Steps

## The Problem
Your frontend and backend are deployed to different Vercel projects, causing CORS errors when the frontend tries to call the backend API.

## Solution

### Step 1: Redeploy the Backend
The backend CORS configuration has been fixed. Redeploy it:

```bash
cd api
vercel --prod
```

Make note of the deployed URL (e.g., `https://mavproxy-backend.vercel.app`)

### Step 2: Update Environment Variable

**Option A: In Vercel Dashboard (Recommended)**
1. Go to your frontend project in Vercel dashboard
2. Settings → Environment Variables
3. Add new variable:
   - Name: `VITE_API_URL`
   - Value: `https://mavproxy-backend.vercel.app` (your actual backend URL)
   - Environments: Production, Preview

**Option B: Update vercel.json**
Edit `/Users/vine/elco/MAVProxy/vercel.json` and update the backend URL:
```json
"build": {
  "env": {
    "VITE_API_URL": "https://your-actual-backend.vercel.app"
  }
}
```

### Step 3: Redeploy Frontend
```bash
cd /Users/vine/elco/MAVProxy
vercel --prod
```

### Step 4: Test
1. Open your frontend URL
2. Try uploading a test file
3. Check browser console - CORS errors should be gone

## What Was Fixed

1. ✅ Updated `api/vercel.json` with proper CORS headers
2. ✅ Added `api/requirements.txt` with all necessary dependencies  
3. ✅ Created `.env.production` and `.env.development` for environment management
4. ✅ Updated root `vercel.json` to pass API URL to build process
5. ✅ The existing `api/index.py` already has CORS middleware configured

## Files Changed

- `api/vercel.json` - Enhanced CORS configuration
- `api/requirements.txt` - Created with dependencies
- `vercel.json` - Added environment variable
- `webui-react/.env.production` - Backend API URL
- `webui-react/.env.development` - Local backend URL

## Verify the Fix

After redeployment, open browser DevTools and check:
- Network tab should show successful OPTIONS preflight requests
- POST to `/analyze` should return 200, not CORS error
- Response headers should include `Access-Control-Allow-Origin: *`

## Alternative: Single Deployment (Not Recommended for Vercel)

If you prefer a single deployment, you could:
1. Remove the separate backend deployment
2. Configure Vercel rewrites to proxy API calls to a serverless function
3. This is more complex and has limitations (4.5MB upload limit)

The separate deployment approach is cleaner and more scalable.
