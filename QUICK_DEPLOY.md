# Quick Deploy Guide 🚀

## Option 1: Automated Script (Recommended)

```bash
./deploy_vercel.sh
```

This script will:
1. Deploy backend first
2. Ask for backend URL
3. Update frontend config automatically
4. Deploy frontend

## Option 2: Manual Deployment

### Deploy Backend
```bash
cd api
vercel --prod
# Note the URL: https://your-backend.vercel.app
```

### Deploy Frontend
```bash
cd ..
# Edit vercel.json and set VITE_API_URL to your backend URL + /api
vercel --prod
```

## Key Files

- `/vercel.json` - Frontend config
- `/api/vercel.json` - Backend config
- `/api/requirements.txt` - Optimized Python dependencies (no pandas/numpy)
- `/.vercelignore` - Excludes backend from frontend build
- `/api/.vercelignore` - Excludes frontend from backend build

## Size Optimization

Backend dependencies reduced from 250MB+ to ~50MB by removing:
- ❌ pandas
- ❌ numpy  
- ❌ matplotlib
- ❌ supabase (optional, graceful fallback)
- ✅ Flask (essential)
- ✅ pymavlink (essential)
- ✅ Flask-Cors (essential)

## Two Vercel Projects Approach

For best results, create two separate projects in Vercel dashboard:

### Project 1: mavproxy-frontend
- Root Directory: `/` (root)
- Framework Preset: Vite
- Build Command: `cd webui-react && npm install && npm run build`
- Output Directory: `webui-react/dist`

### Project 2: mavproxy-backend  
- Root Directory: `/api`
- Framework Preset: Other
- Build Command: (leave empty)
- Output Directory: (leave empty)

## Environment Variables

### Backend Project
- Optional: `SUPABASE_URL`, `SUPABASE_KEY` (if using profiles)

### Frontend Project
- Set in vercel.json: `VITE_API_URL`

## Testing Deployment

After deployment:
1. Open frontend URL
2. Upload a .bin file
3. Check browser console for API requests
4. Verify graphs load correctly

## Troubleshooting

**"Serverless Function has exceeded 250 MB"**
- Run `cd api && vercel --prod` separately
- Check requirements.txt has only essential packages

**CORS errors**
- Verify VITE_API_URL includes `/api` path
- Check Vercel dashboard environment variables

**Backend not responding**
- Check backend logs in Vercel dashboard
- Verify Flask app initializes correctly
