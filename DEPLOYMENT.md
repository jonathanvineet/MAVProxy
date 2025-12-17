# Vercel Deployment Guide

This project has **two separate Vercel deployments**:

1. **Frontend** (webui-react) - React + Vite SPA
2. **Backend** (api) - Python Flask serverless functions

## Prerequisites

- Vercel CLI: `npm install -g vercel`
- Two separate Vercel projects (one for frontend, one for backend)

## Deploy Backend (API)

The backend must be deployed first to get its URL.

### 1. Navigate to API folder
```bash
cd api
```

### 2. Deploy to Vercel
```bash
vercel --prod
```

### 3. Note the deployment URL
Example: `https://mavproxy-backend.vercel.app`

## Deploy Frontend

### 1. Update API URL in root vercel.json

Edit `/vercel.json` and set your backend URL:
```json
{
  "build": {
    "env": {
      "VITE_API_URL": "https://your-backend-url.vercel.app/api"
    }
  }
}
```

### 2. Deploy from root directory
```bash
cd ..  # back to project root
vercel --prod
```

## Configuration Files

### Root `/vercel.json` (Frontend)
- Builds webui-react React app
- Points to backend API URL
- Handles SPA routing

### `/api/vercel.json` (Backend)
- Deploys Python serverless functions
- Routes all requests to index.py
- Configured for Flask app

## Environment Variables

### Backend (api)
Set in Vercel dashboard for the backend project:
- `SUPABASE_URL` (optional - if using profiles)
- `SUPABASE_KEY` (optional - if using profiles)

### Frontend (webui-react)
- `VITE_API_URL` - Set in root vercel.json build.env

## Troubleshooting

### Backend exceeds 250MB limit
- The optimized `api/requirements.txt` only includes essential packages
- Removed: pandas, numpy, matplotlib, requests
- If still too large, consider:
  - Using Vercel's Edge Runtime (lighter)
  - Deploying backend to Railway, Render, or Fly.io instead

### CORS Issues
- Backend already has CORS enabled for all origins
- Check that VITE_API_URL includes the `/api` path

### API Routes not working
- Backend routes work with or without `/api` prefix
- Frontend should use: `https://backend-url.vercel.app/api/upload_chunk`

## Separate Projects Approach

For better organization, create two Vercel projects:

1. **mavproxy-frontend** (root folder)
   - Link to main repository
   - Uses root `vercel.json`
   
2. **mavproxy-backend** (api folder)
   - Link to main repository
   - Set Root Directory to `api` in Vercel dashboard
   - Uses `api/vercel.json`

## Local Development

```bash
# Run both servers locally
npm run dev

# Or separately:
# Terminal 1 - Backend
cd api
source ../.venv/bin/activate
python run_backend.py

# Terminal 2 - Frontend
cd webui-react
npm run dev
```

## Deployment Commands

```bash
# Backend
cd api && vercel --prod

# Frontend (after updating backend URL in vercel.json)
vercel --prod
```
