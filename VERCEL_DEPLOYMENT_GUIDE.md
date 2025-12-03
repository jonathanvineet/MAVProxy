# Vercel Deployment Guide for MAVProxy

This guide explains how to deploy the MAVProxy web UI with separate frontend and backend deployments.

## Architecture

- **Frontend**: React application (webui-react/)
- **Backend**: Flask API (api/)
- Both deployed as separate Vercel projects to avoid CORS issues

## Prerequisites

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

## Deployment Steps

### 1. Deploy Backend API

```bash
cd api
vercel --prod
```

**Important Configuration:**
- Project Name: `mavproxy-backend` (or your preferred name)
- Framework Preset: Other
- Root Directory: `./` (current directory)

After deployment, note the production URL (e.g., `https://mavproxy-backend.vercel.app`)

### 2. Update Frontend API Configuration

Edit `webui-react/src/api.js` and update the `API_BASE_URL`:

```javascript
const API_BASE_URL = 'https://mavproxy-backend.vercel.app';
```

### 3. Deploy Frontend

```bash
cd ../  # Return to root directory
vercel --prod
```

**Important Configuration:**
- Project Name: `mavproxy-frontend` (or your preferred name)
- Framework Preset: Vite
- Build Command: `cd webui-react && npm install && npm run build`
- Output Directory: `webui-react/dist`
- Root Directory: `./` (project root)

## Vercel Configuration Files

### Backend (`api/vercel.json`)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.py"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Credentials",
          "value": "true"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        },
        {
          "key": "Access-Control-Allow-Methods",
          "value": "GET,OPTIONS,PATCH,DELETE,POST,PUT"
        },
        {
          "key": "Access-Control-Allow-Headers",
          "value": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
        }
      ]
    }
  ]
}
```

### Frontend (`vercel.json`)

```json
{
  "buildCommand": "cd webui-react && npm install && npm run build",
  "outputDirectory": "webui-react/dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

## Environment Variables (Optional)

If you need to restrict CORS to specific origins in production:

### Backend
Set in Vercel dashboard:
- `ALLOWED_ORIGINS`: `https://mavproxy-frontend.vercel.app`

Then update `api/index.py`:
```python
CORS(app, resources={r"/*": {"origins": os.getenv('ALLOWED_ORIGINS', '*')}})
```

## Troubleshooting

### CORS Errors

If you see CORS errors:
1. Verify the backend is deployed and accessible
2. Check the frontend is using the correct backend URL
3. Ensure both deployments are using HTTPS
4. Clear browser cache and hard reload (Cmd+Shift+R)

### 404 Errors

If the backend returns 404:
1. Check `api/vercel.json` routes configuration
2. Verify the endpoint path in the frontend API calls
3. Check Vercel deployment logs: `vercel logs <deployment-url>`

### Module Import Errors

If you see "Module not found" errors:
1. Ensure `api/requirements.txt` includes all dependencies
2. Redeploy the backend: `cd api && vercel --prod --force`

## Local Development

For local development with the deployed backend:

```bash
# In webui-react/src/api.js, use local backend:
const API_BASE_URL = 'http://localhost:5000';

# Start local backend
cd server
python mavexplorer_api.py

# Start frontend
cd webui-react
npm run dev
```

## Production URLs

After deployment, you'll have:
- Frontend: `https://mavproxy-frontend-xxx.vercel.app`
- Backend: `https://mavproxy-backend.vercel.app`

Update your documentation and share the frontend URL with users.

## Continuous Deployment

Connect your GitHub repository to Vercel for automatic deployments:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Import your GitHub repository twice:
   - Once for backend (set Root Directory to `api/`)
   - Once for frontend (set Root Directory to `./`)
3. Configure build settings as described above
4. Every push to `main` branch will trigger automatic deployments

## Cost Considerations

Vercel Free Tier includes:
- 100 GB bandwidth per month
- Unlimited serverless function executions (with limits)
- File upload size: 4.5 MB (API Gateway limit)

For larger log files, consider:
- Upgrading to Pro plan
- Using chunked uploads
- Implementing file size limits in the frontend
