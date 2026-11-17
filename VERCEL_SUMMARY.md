# Deployment Summary

## Status: Web Configuration Only (Not Deployed or Verified)

This repository contains a Next.js Vercel configuration. Full app functionality is not yet deployable on Vercel without external worker hosting, a durable database, and shared artifact storage.

## What Was Set Up

### 1. Vercel Configuration Files

- **`vercel.json`**: Vercel project configuration
  - Framework: Next.js
  - Build command: `npm run build`
  - Output directory: `.next`
  - Functions timeout: 60 seconds
  - Region: iad1 (US East)

- **`vercel-build.sh`**: Build script that sets environment variables before building

- **`vercel-dev.sh`**: Dev script for local development

- **`vercel-worker.sh`**: Worker script for background job processing

- **`.vercelignore`**: Files to exclude from Vercel deployment

### 2. Updated `package.json`

Added Vercel-specific scripts:
```json
{
  "scripts": {
    "vercel-build": "vercel-build.sh",
    "vercel-dev": "vercel-dev.sh",
    "vercel-worker": "vercel-worker.sh"
  }
}
```

### 3. Documentation

- **`VERCEL_DEPLOYMENT.md`**: Complete deployment guide with all environment variables
- **`VERCEL_SUMMARY.md`**: This file — quick reference

## Current Status

- Local dev server and persistent worker: **not verified in this session**
- Next.js syntax and passwordless security smoke checks: **passed**
- Full dependency-based build and production deployment: **not verified**
- Vercel web config exists; worker/artifact persistence requires external infrastructure

## How to Deploy to Vercel

### Web Deployment Setup

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Add Vercel deployment configuration"
   git remote add origin https://github.com/yourusername/storyman.git
   git push -u origin main
   ```

2. **Import in Vercel:**
   - Go to https://vercel.com/new
   - Import your repository
   - Click "Deploy"

3. **Configure Environment:**
   - Add required variables (see `VERCEL_DEPLOYMENT.md`)
   - Restart deployment

### Required Environment Variables

| Variable | Purpose | Min Length |
|----------|---------|------------|
| `APP_URL` | Exact external HTTPS origin (passwordless workspace; protect at deployment layer) | - |
| `TOKEN_ENCRYPTION_KEY` | Token encryption | 32 chars |
| `DATABASE_URL` | Database connection (PostgreSQL) | - |

## Current Local Setup

- **App**: http://127.0.0.1:3210
- **Database**: SQLite (local)
- **Worker**: Running and healthy
- **Health Check**: http://127.0.0.1:3210/api/health

## Production Considerations

### What Works in Vercel

✅ Next.js App Router
✅ API routes with 60s timeout
✅ Environment variables
✅ Server-side rendering
✅ Static assets

### What May Need Adjustment

- **File Storage**: Vercel function filesystem is ephemeral, and durable shared artifact storage is not implemented
- **Worker**: Vercel does not execute the persistent polling worker; host it separately
- **Media Processing**: FFmpeg/Python are installed in the Docker image, not guaranteed in Vercel serverless functions
⚠️ **Long-Running Tasks**: TTS/alignment are synchronous

### Recommendations for Production

1. **Use PostgreSQL** instead of SQLite for better persistence
2. **Add Redis** for job queue (BullMQ) to handle long-running tasks
3. **Implement S3** for artifact storage
4. **Add monitoring** (Vercel Analytics, Sentry, etc.)
5. **Set up backups** for database and artifacts
6. **Configure custom domain** with SSL

## Next Steps

1. Run `npm ci && npm run check` on a machine with npm registry access
2. Set up PostgreSQL and persistent worker/artifact hosting
3. Restrict access at the network or hosting layer
4. Configure `APP_URL` for the exact deployed HTTPS origin
5. Run end-to-end tests before publishing
6. ⏳ Test production deployment
7. ⏳ Set up monitoring and backups

## Files Modified/Created

**Created:**
- `vercel.json`
- `vercel-build.sh`
- `vercel-dev.sh`
- `vercel-worker.sh`
- `.vercelignore`
- `VERCEL_DEPLOYMENT.md`
- `VERCEL_SUMMARY.md`

**Modified:**
- `package.json` (added vercel scripts)

## Support

For deployment issues:
1. Check `VERCEL_DEPLOYMENT.md` for environment variable setup
2. Review Vercel deployment logs
3. Check `VERCEL_DEPLOYMENT.md` troubleshooting section

For development issues:
1. Check `AGENTS.md` for development guidelines
2. Check `README.md` for feature documentation
3. Check `ARCHITECTURE.md` for system design
4. Check `RUNBOOK.md` for operational procedures
