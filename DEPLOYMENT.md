# MAVExplorer WebUI - Deployment Guide

## Problem
Vercel's serverless functions have a 250 MB unzipped size limit. **pymavlink** alone is ~250MB, causing deployment to fail.

## Solution: Deploy Separately

### 1. Frontend Deployment (Vercel)
The React frontend is lightweight and deploys easily to Vercel.

```bash
# Push to GitHub (or connect repo directly to Vercel)
git push origin main

# Or deploy directly with Vercel CLI:
cd /Users/vine/elco/MAVProxy
vercel --prod
```

**Vercel Configuration** (`vercel.json`):
- Builds `webui-react/` only
- Outputs static site from `dist/`
- No Python dependencies needed

### 2. Backend Deployment (Railway, Render, or Heroku)

The Flask API needs a backend service that supports Python and large dependencies.

#### **Option A: Railway.app** (Recommended - Easy)

```bash
# 1. Create account at railway.app
# 2. Connect GitHub repo
# 3. Railway auto-detects Python from api/requirements.txt
# 4. Deploy the api/ folder
```

**Railway Setup:**
- Root directory: `api`
- Python version: 3.12
- Start command: `python index.py`
- Port: Railway sets `PORT` env var automatically

#### **Option B: Render.com**

```bash
# 1. Create account at render.com
# 2. New Web Service → Connect GitHub
# 3. Settings:
#    - Root: api/
#    - Runtime: Python 3.12
#    - Build: pip install -r requirements.txt
#    - Start: python index.py
```

#### **Option C: Heroku** (Free tier no longer available, but can try)

```bash
heroku create mavexplorer-api
heroku config:set FLASK_ENV=production
git push heroku main
```

### 3. Connect Frontend to Backend

After deploying backend, update frontend environment:

**In Vercel Dashboard:**
1. Go to your project settings
2. Environment Variables
3. Add: `VITE_API_URL=https://your-backend-url.railway.app` (or render/heroku URL)
4. Redeploy

Or update before deploying:

```bash
cd webui-react
VITE_API_URL=https://your-api.railway.app npm run build
```

### 4. CORS Configuration

Make sure Flask API has CORS enabled for your Vercel domain:

In `api/index.py`:
```python
from flask_cors import CORS
CORS(app, origins=[
    "http://localhost:5173",
    "http://localhost:5174",
    "https://your-vercel-frontend.vercel.app"
])
```

---

## Quick Deploy Commands

### Local Testing
```bash
cd /Users/vine/elco/MAVProxy
npm run dev  # Runs both frontend + backend on localhost
```

### Deploy to Vercel (Frontend Only)
```bash
cd /Users/vine/elco/MAVProxy
vercel --prod
```

### Deploy to Railway (Backend Only)
```bash
# After connecting GitHub to Railway:
git push origin main
# Railway auto-deploys when you push to main

# Or use Railway CLI:
railway deploy
```

---

## Deployment Status Checklist

- [ ] Frontend deployed to Vercel
- [ ] Backend deployed to Railway/Render/Heroku
- [ ] Environment variable `VITE_API_URL` set in Vercel
- [ ] CORS configured in Flask for your Vercel domain
- [ ] Frontend can reach backend API
- [ ] Upload file and test graphs work end-to-end

---

## Troubleshooting

**Frontend shows "Network Error"**
- Check `VITE_API_URL` environment variable is set correctly
- Verify backend service is running
- Check browser console (F12) for exact error

**Backend returns 404**
- Verify Railway/Render is using `api/` as root directory
- Check start command is `python index.py`
- Confirm `index.py` is in `api/` folder

**CORS errors**
- Add Vercel domain to CORS whitelist in `api/index.py`
- Redeploy backend

**Large file uploads fail**
- Vercel has API request size limit (~4.5MB)
- Backend already uses chunked upload (3.5MB chunks)
- This should work, but test with smaller files first

---

## Cost Estimate

| Service | Cost | Notes |
|---------|------|-------|
| Vercel  | Free | 100GB/month bandwidth, 6000 build hours |
| Railway | $5/month | Includes $5 credit, pymavlink ~500MB |
| Render  | Free | Free tier with generous limits |
| Heroku  | Discontinued free tier | Use Railway/Render instead |

---

## Environment Variables Reference

### Vercel (Frontend)
```
VITE_API_URL=https://api-domain.railway.app
```

### Railway/Render (Backend)
```
FLASK_ENV=production
PORT=8000 (auto-set by Railway/Render)
```

No other secrets needed unless you re-enable Supabase integration.
