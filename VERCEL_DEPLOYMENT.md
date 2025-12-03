# Vercel Deployment Guide for MAVExplorer WebUI

## Overview
This guide explains how to deploy both the React frontend and Python Flask backend to Vercel.

**Architecture:**
- **Frontend**: React + Vite → Deployed to Vercel (static + edge functions)
- **Backend**: Python Flask API → Deployed to Vercel Serverless Functions
- **Storage**: In-memory session storage (ephemeral on Vercel)

## Prerequisites
1. **Vercel Account**: Sign up at https://vercel.com
2. **GitHub Account**: Push your repo to GitHub (Vercel integrates with GitHub)
3. **Vercel CLI** (optional but recommended):
   ```bash
   npm install -g vercel
   ```

## Option 1: Deploy via GitHub (Recommended for Continuous Deployment)

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Set up Vercel deployment"
git push origin master
```

### Step 2: Connect to Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Select your GitHub repo (`jonathanvineet/MAVProxy`)
4. Configure Build Settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm install --legacy-peer-deps && cd webui-react && npm install && npm run build`
   - **Output Directory**: `webui-react/dist`
   - **Install Command**: Leave blank (Vercel handles it)
5. Click **"Deploy"**

### Step 3: Set Environment Variables (Vercel Dashboard)
1. Go to **Project Settings** → **Environment Variables**
2. Add:
   ```
   VITE_API_URL = https://your-project.vercel.app/api
   ```
3. Redeploy with new env vars

---

## Option 2: Deploy via Vercel CLI

### Step 1: Login to Vercel
```bash
vercel login
```

### Step 2: Deploy
```bash
# From repo root
vercel --prod
```

Follow the prompts:
- **Which scope?** Select your account
- **Link to existing project?** Choose "No" for first deployment
- **Project name?** `mavexplorer` (or your preference)
- **Framework?** Vite
- **Build command?** Press Enter (Vercel auto-detects)
- **Output directory?** Press Enter (auto-detected)

### Step 3: Add Environment Variables
```bash
vercel env add VITE_API_URL
# Enter: https://your-project.vercel.app/api
```

Redeploy:
```bash
vercel --prod
```

---

## Key Files for Deployment

### `vercel.json` (Root)
Configures Vercel build and routing:
- Routes `/api/*` to serverless functions
- Routes all other paths to frontend
- Sets environment variables

### `api/index.py` (Backend)
- Flask app configured as serverless function
- Contains all API endpoints
- Handles CORS and file uploads

### `webui-react/vite.config.js` (Frontend)
- Already configured for building
- Proxy removed (uses env var `VITE_API_URL`)

---

## Important: Update API Base URL

Since the backend is now at `https://your-vercel-app.vercel.app/api`, update your frontend to use this URL in production.

**Option A: Use Environment Variable**
In `webui-react/src/api.js`:
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3030';
```

**Option B: Auto-detect**
```javascript
const API_BASE_URL = window.location.origin + '/api';
```

Check your current API configuration:
```bash
cat webui-react/src/api.js
```

---

## Limitations & Considerations

### Ephemeral Storage
- Vercel functions are **stateless and ephemeral**
- In-memory `UPLOADS` dictionary is **NOT persisted** between requests
- **Solution**: Implement persistent storage:
  - **Option 1**: AWS S3 + S3 presigned URLs
  - **Option 2**: Vercel KV (Redis)
  - **Option 3**: Firebase Storage

### File Upload Size
- Default: 4.5 MB max
- Can increase to 50 MB with Vercel Pro plan

### Cold Starts
- First request to backend may take 5-10 seconds (function startup)
- Subsequent requests are faster

### Python Dependencies
- Only `pymavlink`, `pandas`, `flask-cors` are built-in
- Custom dependencies must be in `requirements.txt`

---

## Testing Deployment

### Test Frontend
```bash
curl https://your-project.vercel.app
```

### Test Backend Health
```bash
curl https://your-project.vercel.app/api/ping
```

### Test Full Flow
1. Visit https://your-project.vercel.app
2. Upload a `.bin` log file
3. Check browser network tab to see API calls to `/api/analyze`

---

## Troubleshooting

### Build Fails
- Check **Vercel dashboard** → **Deployments** → **Latest** for error logs
- Run locally: `vercel --prod` then check logs

### API Not Found (404 on `/api`)
- Ensure `api/index.py` exists
- Check `vercel.json` rewrites config
- Verify `vercel.json` syntax: `vercel-cli/edge`

### Upload Fails
- Check file size (< 4.5 MB default)
- Verify `/api/analyze` is receiving POST with `file` field

### CORS Errors
- Backend already has CORS enabled in `api/index.py`
- If still failing, add to Vercel dashboard env vars

---

## Rollback & Updates

### Rollback to Previous Deployment
1. Go to **Vercel Dashboard** → **Deployments**
2. Find previous successful deployment
3. Click **Promote to Production**

### Deploy Updates
```bash
git add .
git commit -m "Update feature"
git push origin master
# Vercel auto-deploys on push
```

Or manually:
```bash
vercel --prod
```

---

## Custom Domain

1. In **Vercel Dashboard** → **Project Settings** → **Domains**
2. Add your domain (e.g., `mavexplorer.example.com`)
3. Follow DNS setup instructions

---

## Next Steps

1. **Persistent Storage**: Implement S3 or Vercel KV for uploads
2. **Database**: Add PostgreSQL for user accounts, saved graphs, etc.
3. **Monitoring**: Set up error tracking (Sentry, LogRocket)
4. **Analytics**: Add frontend analytics (Vercel Analytics, PostHog)

---

## Support

- **Vercel Docs**: https://vercel.com/docs
- **Flask Docs**: https://flask.palletsprojects.com
- **Vite Docs**: https://vitejs.dev

