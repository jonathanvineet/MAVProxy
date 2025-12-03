# Quick Start: Vercel Deployment

## 5-Minute Setup

### 1. Push to GitHub
```bash
cd /Users/vine/elco/MAVProxy
git add .
git commit -m "Add Vercel deployment config"
git push origin master
```

### 2. Connect to Vercel
1. Visit https://vercel.com/dashboard
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repo: `jonathanvineet/MAVProxy`
4. Click **"Import"**
5. Leave build settings as default, click **"Deploy"**

**That's it! ✅ Your app is deployed.**

---

## What Was Set Up

✅ **Backend** (`api/index.py`)
- Python Flask API running as serverless functions
- All endpoints from `server/analyze_server.py` ported
- CORS enabled for frontend

✅ **Frontend** (`webui-react/`)
- React + Vite builds to static files
- Auto-detects API URL (localhost in dev, production URL in prod)
- All existing components work unchanged

✅ **Configuration Files**
- `vercel.json` - Routing and build config
- `api/index.py` - Serverless backend
- `webui-react/src/api.js` - Updated to use correct API URL
- `requirements.txt` - Python dependencies

---

## Access Your App

After deployment, Vercel gives you a URL like:
```
https://mavproxy-xxxxx.vercel.app
```

### Test It
1. Open the URL in your browser
2. Upload a `.bin` log file
3. Select message and field
4. Download CSV or view graph

---

## Important Notes

⚠️ **Storage is Ephemeral**
- Uploaded files are stored in memory only
- Files are **lost when the function stops**
- Solution: Use S3 or Vercel KV for persistent storage (see `VERCEL_DEPLOYMENT.md`)

⚠️ **File Size Limit**
- Default: 4.5 MB
- Vercel Pro: 50 MB

⚠️ **Cold Starts**
- First API request may take 5-10 seconds
- Subsequent requests are faster

---

## Monitor Deployment

### Vercel Dashboard
- View logs: https://vercel.com/dashboard → Your Project → Deployments
- Check errors: Click latest deployment, then "Function Logs"

### Local Testing Before Deploy
```bash
# Test backend locally
source .venv/bin/activate
python server/analyze_server.py

# In another terminal, test frontend
cd webui-react
npm run dev
# Visit http://localhost:5173
```

---

## Update & Redeploy

After making changes:
```bash
git add .
git commit -m "Your change"
git push origin master
# Vercel auto-deploys on push
```

Or manual deploy:
```bash
npm install -g vercel
vercel --prod
```

---

## Troubleshooting

**Q: Upload fails with "API not found"**
- Check browser console for actual URL
- Verify `vercel.json` is in repo root
- Redeploy: `vercel --prod`

**Q: CORS errors**
- Already handled in `api/index.py`
- Check browser Network tab for actual error

**Q: Files not saving**
- Expected! In-memory storage doesn't persist
- Implement S3 for production

---

## Next Steps

For production use, add:
1. **Persistent storage** (AWS S3 / Vercel KV)
2. **Database** (Vercel Postgres / MongoDB)
3. **Authentication** (optional)
4. **Error tracking** (Sentry)

See `VERCEL_DEPLOYMENT.md` for full guide.

