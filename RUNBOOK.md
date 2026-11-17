# Operator runbook

## Start / inspect

1. Run `npm run doctor` from the repository; it prints version/availability and configuration booleans without credential values.
2. Configure `.env.local` securely and start `npm run dev` plus `npm run worker` in separate processes. Confirm `/api/health` and dashboard worker heartbeat.
3. Submit a manual prompt. Inspect persisted activity and exact blocker. Missing research/provider access is a blocked job, not a successful video.
4. Inspect and enable the three schedule slots independently. Keep generation mode `GENERATE_ONLY` and publishing disabled until the owner approves a real completed variant.

## Recover a blocked job

- `BLOCKED_AUTH`: configure the named server environment, restart affected processes and reconnect account OAuth if required; use Retry on the saved job.
- OpenCode Zen writing uses `WRITING_PROVIDER=opencode-cli` and a listed `OPENCODE_MODEL` free model. If the free tier responds with a usage-limit error, the worker tries the configured `AI_BASE_URL`/`AI_MODEL` fallback and records which model wrote the draft. Check the activity before review. Keep the `opencode` CLI and its own account authorization available on the worker host. The Docker image does not currently install or authorize OpenCode; configure an accessible writing provider before using Compose.
- `NEEDS_RESEARCH`: add independent reliable documents or submit a better-supported subject. Source URLs require public HTTPS. Human research review remains mandatory.
- `NEEDS_REVIEW`: inspect script/claim references or alignment quality. Do not mark a low-confidence alignment approved merely to continue.
- `CANVA_CAPABILITY_MISSING` / `BLOCKED_RIGHTS`: use a permitted Canva design/export or supply standalone-licensed media. Never scrape stock files or substitute a fake connected state.
- Worker offline: inspect the worker process, database permissions and heartbeat; restart the standalone worker. Existing leases expire before reclaimed work. Do not delete the job database to reset a stuck job.
- Interrupted publication: inspect provider account and any saved external ID before retrying. No new upload should be initiated just because a local HTTP request timed out.

Pause/cancel is cooperative at stage boundaries. An in-flight TTS request or render can finish before the worker observes the new state. Uploaded originals remain stored.

## Back up / restore

For local SQLite, stop app/worker cleanly or use SQLite's online backup API. Copy the database and its journal consistently; copying a live `.sqlite` file alone can omit WAL data. Back up `data/artifacts`, the encrypted OAuth records within the database, the original `TOKEN_ENCRYPTION_KEY` and the securely stored configuration. Keep backups encrypted and access restricted. Test restore in a separate directory before replacing the live store.

For PostgreSQL, run a scheduled `pg_dump` through the deployment secret manager and back up the artifact volume separately; encrypted account records are included in the database backup. Restore to a staging database and point a staging worker at it with live publishing disabled. No successful backup/restore drill has yet been demonstrated.

## Docker target

Set `.env` with `POSTGRES_PASSWORD`, owner credentials, a random session key, token encryption key and configured providers. `docker compose up -d --build` starts app/worker/PostgreSQL; inspect `docker compose ps` and logs. Artifacts share a persistent volume between app/worker; encrypted account records are held in PostgreSQL. The optional `future-bullmq` profile provides Redis only; the application does not currently consume it.

The Docker image includes FFmpeg/Pillow, not optional faster-whisper model dependencies. Build/install these explicitly and verify a real alignment before enabling generation. Bindings default to loopback. For remote hosting, set HTTPS `APP_URL`, TLS/reverse-proxy controls and owner auth first. Never expose a passwordless local-mode instance.

## Verification before production

Run the compiler, tests and build, then perform a real source-backed audio/video run, review first/last spoken sentences and caption sync, inspect ffprobe and loudness, verify a distinct scheduled story without altering manual slots, test restart recovery, and test each authorized publishing destination with the owner's approval. Store actual IDs/URLs and publication state. A synthetic render fixture proves media plumbing only.
