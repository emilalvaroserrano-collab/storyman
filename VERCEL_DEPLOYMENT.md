# Vercel Deployment Guide

## Quick Start

1. Push this repository to GitHub
2. Import the repository in [Vercel](https://vercel.com/new)
3. Click "Deploy"
4. Configure environment variables (see below)

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables

### Required for Production

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_URL` | Exact HTTPS origin used for same-origin request checks | `https://your-private-storyman.example` |
| `DATABASE_URL` | PostgreSQL URL required for durable production persistence (SQLite is local-only) | `postgres://user:pass@host:5432/db` |
| `TOKEN_ENCRYPTION_KEY` | Token encryption key (must be ≥32 chars) | `your-token-encryption-key` |

### Optional - Writing Provider

| Variable | Description | Default |
|----------|-------------|---------|
| `WRITING_PROVIDER` | Writing provider (opencode-cli, local) | `opencode-cli` |
| `OPENCODE_MODEL` | OpenCode model ID for writing | - |
| `ALLOW_WRITING_FALLBACK` | Enable local fallback when OpenCode fails | `false` |
| `AI_BASE_URL` | Custom AI API endpoint | - |
| `AI_API_KEY` | AI API key | - |
| `AI_MODEL` | AI model ID | - |

### Optional - TTS Provider

| Variable | Description | Default |
|----------|-------------|---------|
| `TTS_PROVIDER` | TTS provider (zonos, gemini, openai-compatible) | `zonos` |
| `GEMINI_API_KEY` | Gemini API key for TTS | - |
| `GEMINI_TTS_MODEL` | Gemini TTS model | `gemini-3.8-flash-tts` |
| `GEMINI_TTS_VOICE` | Voice name | `Riko` |
| `GEMINI_TTS_STYLE` | Narration style | `Rich, velvety, unhurried audiobook narration` |
| `GEMINI_TTS_BASE_URL` | Gemini API base URL | - |
| `TTS_BASE_URL` | TTS API endpoint | `http://127.0.0.1:1919/v1` |
| `TTS_API_KEY` | TTS API key | - |
| `TTS_MODEL` | TTS model ID | `zonos3` |
| `TTS_VOICE` | Voice ID | - |
| `TTS_LANGUAGE` | Language code | - |
| `TTS_CHUNK_CHARS` | Characters per TTS chunk | `1800` |

### Optional - Alignment (Python)

| Variable | Description | Default |
|----------|-------------|---------|
| `ALIGNMENT_COMMAND_JSON` | Alignment command as JSON array | - |
| `WHISPER_MODEL` | Whisper model to use | `small` |
| `WHISPER_LANGUAGE` | Language for Whisper | `tl` |
| `PYTHON_PATH` | Python executable | `python3` |
| `FFMPEG_PATH` | FFmpeg executable | `ffmpeg` |
| `FFPROBE_PATH` | FFprobe executable | `ffprobe` |

### Optional - OAuth Providers

| Variable | Description |
|----------|-------------|
| `CANVA_CLIENT_ID` | Canva OAuth client ID |
| `CANVA_CLIENT_SECRET` | Canva OAuth client secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `META_CLIENT_ID` | Facebook OAuth client ID |
| `META_CLIENT_SECRET` | Facebook OAuth client secret |
| `META_PAGE_ID` | Facebook Page ID |
| `META_GRAPH_VERSION` | Facebook Graph API version |
| `TIKTOK_CLIENT_ID` | TikTok OAuth client ID |
| `TIKTOK_CLIENT_SECRET` | TikTok OAuth client secret |

### Optional - Publishing

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_LIVE_PUBLISHING` | Enable live publishing | `false` |

## Deployment Steps

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/storyman.git
   git push -u origin main
   ```

2. **Import in Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Click "Deploy"

3. **Configure Environment:**
   - In Vercel Dashboard, go to your project → Settings → Environment Variables
   - Add all required variables from the table above, including `APP_URL` set to the deployed HTTPS origin (not localhost)
   - Restart the deployment after adding variables

4. **Configure Custom Domain (Optional):**
   - Go to Project → Settings → Domains
   - Add your custom domain
   - Follow Vercel's DNS instructions

## Runtime Configuration

Vercel automatically handles:
- **Builds**: Runs `npm run build` as configured in `vercel.json`
- **Functions**: API routes target a 60-second timeout configured in `vercel.json`; deployment settings and plan limits still apply
- **Regions**: Deployed to IAD1 (US East)

## Database Setup

### Option 1: SQLite (Local only)

SQLite is not suitable for persistent data on Vercel: the function filesystem is ephemeral. For durable jobs, schedules, and OAuth state, configure `DATABASE_URL` to use hosted PostgreSQL.

### Option 2: PostgreSQL

1. Create a PostgreSQL database (Supabase, Neon, etc.)
2. Set `DATABASE_URL` in Vercel environment variables
3. Vercel will use PostgreSQL instead of SQLite

## Worker Deployment

Vercel does not execute a continuously running worker process from this repository. Deploy the existing `npm run worker` process to a separate always-on host/container with the same `DATABASE_URL` and durable artifact storage. Without that worker, queued jobs and scheduled runs will not execute. Long FFmpeg/TTS tasks are also not validated for Vercel function execution.

## Limitations in Vercel

1. **Worker Persistence**: Vercel does not host the persistent worker; run it on a separate long-running host.
2. **File Storage**: `data/artifacts` is local filesystem storage; Vercel functions do not provide durable shared storage. External durable storage is not implemented.
3. **Media Processing**: Video rendering requires FFmpeg and Python. These are included in the Docker build but may have size constraints.
4. **Long-Running Tasks**: TTS and alignment are synchronous. Consider implementing async processing for production.

## Troubleshooting

### Build Errors

- Check that all environment variables are set correctly
- Ensure `DATABASE_URL` is valid if using PostgreSQL
- Restrict the passwordless workspace to approved users via deployment-layer access control or private networking

### Runtime Errors

- Check Vercel logs for specific errors
- Ensure `ENABLE_LIVE_PUBLISHING` is set correctly
- Verify OAuth provider credentials are valid

### Database Issues

- If using PostgreSQL, ensure the connection string is correct
- Check Vercel's database connection limits
- Regular backups are recommended

## Local Development with Vercel Config

To test locally with Vercel settings:

```bash
# Copy vercel environment variables to .env.local
cp .env.example .env.local

# Edit .env.local with your Vercel values
# Then run:
npm run dev
```

## Production Checklist

- [ ] Passwordless access restricted at the network or hosting layer
- [ ] `APP_URL` matches the production HTTPS origin
- [ ] PostgreSQL and a separate persistent worker configured
- [ ] All required environment variables set
- [ ] Database URL configured (if using PostgreSQL)
- [ ] OAuth provider credentials verified
- [ ] Custom domain configured (if needed)
- [ ] SSL/HTTPS enabled (automatic in Vercel)
- [ ] Backups configured for database
- [ ] Monitoring/alerts set up

## Support

For issues specific to this deployment:
1. Check Vercel deployment logs
2. Review environment variable settings
3. Check GitHub Issues for known problems
