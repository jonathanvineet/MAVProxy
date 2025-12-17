# Deploy to Vercel - Quick Steps

## Prerequisites
- Vercel account
- Git repository synced
- Backend deployed first

## Step 1: Deploy Backend

```bash
cd api
vercel --prod
```

Save the deployment URL (e.g., `https://mavproxy-backend.vercel.app`)

## Step 2: Update Frontend Config

Edit root `vercel.json`:
```json
{
  "env": {
    "VITE_API_URL": "https://your-backend-url.vercel.app"
  }
}
```

## Step 3: Deploy Frontend

```bash
cd ..
vercel --prod
```

## Step 4: Verify Deployment

### Test Backend Health
```bash
curl https://your-backend.vercel.app/health
```

Should return:
```json
{"status":"ok"}
```

### Test CORS
```bash
curl -H "Origin: https://your-frontend.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  https://your-backend.vercel.app/api/upload_chunk
```

Should include:
```
Access-Control-Allow-Origin: https://your-frontend.vercel.app
```

## Git Workflow

```bash
# 1. Update vercel.json with backend URL
git add api/vercel.json vercel.json
git commit -m "fix: Update Vercel configs for CORS

- Backend: Simplified routing for proper Flask CORS
- Frontend: Updated API URL to backend service
- CORS: Enabled in Flask with automatic preflight handling"

git push

# 2. Deploy backend
cd api && vercel --prod

# 3. Get backend URL from deployment
# Example: https://mavproxy-backend-xyz.vercel.app

# 4. Update vercel.json with backend URL
# Edit: VITE_API_URL in vercel.json

# 5. Commit and deploy frontend
git add vercel.json
git commit -m "chore: Update backend URL for production"
git push

# 6. Deploy frontend
vercel --prod
```

## Files Modified

- `/api/vercel.json` - Simplified backend config
- `/vercel.json` - Frontend config with API URL
- `/webui-react/src/api.js` - Auto-adds /api to URL
- `/api/index.py` - Enhanced CORS handling

## Troubleshooting

### Still getting CORS errors?
1. Restart the deployment: `vercel --prod`
2. Clear browser cache: Ctrl+Shift+Delete
3. Check Vercel logs in dashboard

### Backend URL not working?
1. Verify deployment succeeded in Vercel dashboard
2. Test: `curl https://your-backend.vercel.app/health`
3. Check environment variables in dashboard

### API calls returning 404?
1. Verify VITE_API_URL in vercel.json
2. Check that API URL includes `/api`
3. Test: `curl https://your-backend.vercel.app/api/graphs`

## Done! ✅

Your app is now live with proper CORS and API routing!
