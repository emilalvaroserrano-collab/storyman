# Web Deployment Configuration (Not Production-Ready)

Storyman has a Vercel web configuration, but the full pipeline is **not production-ready on Vercel**: persistent PostgreSQL, durable artifact storage, and an external long-running worker are still required.

## Current Status

| Component | Status | URL |
|-----------|--------|-----|
| **Dev Server** | Not verified in this session | http://127.0.0.1:3210 (local) |
| **Worker** | Not verified in this session | Separate long-running process |
| **Database** | Local SQLite supported | `data/storyman.sqlite` |
| **Build** | Full build not verified in this session | `npm run check` requires dependencies |
| **Health** | Not verified in this session | http://127.0.0.1:3210/api/health (local) |

## What's Ready for Deployment

### ✅ Vercel Configuration

- [x] `vercel.json` — Project configuration
- [x] `vercel-build.sh` — Build script with env vars
- [x] `vercel-dev.sh` — Development script
- [x] `vercel-worker.sh` — Worker script
- [x] `.vercelignore` — Deployment exclusions

### ✅ Documentation

- [x] `VERCEL_DEPLOYMENT.md` — Complete deployment guide
- [x] `VERCEL_SUMMARY.md` — Quick reference
- [x] `DEPLOYMENT_READY.md` — This file

### ✅ Package Scripts

```json
{
  "vercel-build": "vercel-build.sh",
  "vercel-dev": "vercel-dev.sh",
  "vercel-worker": "vercel-worker.sh"
}
```

## 🚀 How to Deploy (2 Steps)

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Add Vercel deployment configuration"
git branch -M main
git remote add origin https://github.com/yourusername/storyman.git
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Go to https://vercel.com/new
2. Import your repository
3. Click "Deploy"
4. Configure environment variables (see below)

## 🔧 Environment Variables

### Required for Production

The workspace is passwordless. Protect it with private-network or deployment-level access controls before exposing it remotely. Set these in Vercel Dashboard → Settings → Environment Variables:

```
APP_URL=https://your-private-storyman.example
DATABASE_URL=postgres://user:pass@host:5432/db
TOKEN_ENCRYPTION_KEY=your-token-encryption-key-32-chars-minimum
```

### Optional (for full functionality)

```
WRITING_PROVIDER=opencode-cli
OPENCODE_MODEL=your-model-id
ALLOW_WRITING_FALLBACK=false
TTS_PROVIDER=zonos
GEMINI_API_KEY=your-gemini-key
```

See `VERCEL_DEPLOYMENT.md` for all available variables.

## 📚 Documentation

- **`VERCEL_DEPLOYMENT.md`** - Complete deployment guide with all environment variables, troubleshooting, and production considerations
- **`VERCEL_SUMMARY.md`** - Quick reference and status
- **`AGENTS.md`** - Development guidelines and architecture
- **`README.md`** - Feature documentation
- **`ARCHITECTURE.md`** - System design
- **`RUNBOOK.md`** - Operational procedures

## ⚙️ Vercel Settings

- **Framework**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Functions Timeout**: 60 seconds
- **Region**: iad1 (US East)
- **Environment**: Node.js 22.13+

## 🎯 Production Checklist

- [ ] Push to GitHub
- [ ] Deploy to Vercel
- [ ] Set all required env vars
- [ ] Configure PostgreSQL (recommended)
- [ ] Set up OAuth providers (Canva, Google, Facebook, TikTok)
- [ ] Configure custom domain (optional)
- [ ] Set up database backups
- [ ] Configure monitoring/alerts
- [ ] Test all features in production

## 📝 Notes

- The app is **local-first** and deliberately not production-ready
- Real integrations require account/provider configuration
- OAuth credentials are encrypted and stored server-side
- Vercel function storage is ephemeral; PostgreSQL and external artifact storage are required for persistence
- The worker does **not** run persistently on Vercel; deploy `npm run worker` to an always-on host

## 🆘 Need Help?

1. Check `VERCEL_DEPLOYMENT.md` for detailed instructions
2. Review Vercel deployment logs
3. Check environment variable settings
4. See `RUNBOOK.md` for operational procedures

---

**Status**: Web configuration prepared; full production deployment requires additional infrastructure
**Last Updated**: 2026-11-17
