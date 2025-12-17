# 🚀 Deploy to Vercel - 3 Commands

## Before You Start
- [ ] Backend URL from first deployment (or have Vercel CLI ready)
- [ ] Git synced and clean

## Command 1: Commit Changes

```bash
cd /Users/vine/elco/MAVProxy
git add api/vercel.json vercel.json api/index.py webui-react/src/api.js
git commit -m "fix: Resolve CORS errors in Vercel deployment"
git push
```

## Command 2: Deploy Backend

```bash
cd api
vercel --prod
```

**Copy the URL from output** (e.g., `https://mavproxy-backend-xyz.vercel.app`)

## Command 3: Deploy Frontend

Update `/vercel.json` VITE_API_URL:
```bash
# Open /vercel.json and change:
# "VITE_API_URL": "https://your-backend-url.vercel.app"

git add vercel.json
git commit -m "chore: Update backend URL"
git push

vercel --prod
```

## ✅ Done!

Frontend URL: shown in terminal output  
Backend URL: from step 2

## Test It

```bash
./verify_deployment.sh
```

---

## What Was Fixed

| File | Fix |
|------|-----|
| `/api/vercel.json` | Removed header config, let Flask handle CORS |
| `/vercel.json` | Moved API URL from build.env to env |
| `/api/index.py` | Enhanced Flask CORS with automatic preflight |
| `/webui-react/src/api.js` | Auto-add `/api` to backend URL |

## Key Points

✅ CORS is handled by Flask, not Vercel route headers  
✅ Backend deploys independently  
✅ Frontend gets API URL at build time  
✅ Chunked uploads work (3.5MB chunks)  
✅ No file size limit issues  

## Troubleshoot

**Still getting CORS errors?**
1. Hard refresh: `Ctrl+Shift+Delete`
2. Redeploy backend: `cd api && vercel --prod`
3. Check browser Network tab for OPTIONS → 200

**API returning 404?**
1. Check VITE_API_URL in vercel.json includes backend domain
2. Verify `/api` is auto-added in api.js
3. Test: `curl https://your-backend.vercel.app/api/graphs`

See `COMMIT_AND_DEPLOY.md` for detailed steps.
