<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Storyman

Single-owner, local-first story/video production app: a Next.js dashboard plus a separate polling worker. SQLite by default, PostgreSQL optional. The project is deliberately not production ready; incomplete provider/media paths are surfaced as blockers rather than faked.

## Commands

- `npm run dev` — web UI at `http://127.0.0.1:3210` (loopback only).
- `npm run worker` — required in a second terminal for jobs, variants and schedules. The web server never executes the pipeline.
- `npm run check` — the real gate: `typecheck` -> `test` -> `build`. Run it before finishing.
- Script writing prefers the installed OpenCode Zen CLI free model (`WRITING_PROVIDER=opencode-cli`, `OPENCODE_MODEL=opencode/glm-5.3-flash-free`) and falls back to configured `AI_BASE_URL`/`AI_MODEL` on quota/provider errors. The OpenCode agent has all tools denied; do not change that boundary or pass TTS/OAuth secrets to its environment.
- `npm test` — Node test runner via tsx over `tests/*.test.ts`; use `node:test` + `node:assert/strict` (no Jest/Vitest). Single file: `npx tsx --test tests/media.test.ts`. Single case: `npx tsx --test --test-name-pattern "alignment gates" tests/media.test.ts`.
- `npm run doctor` — prints tool availability and config booleans without secrets.
- No lint/format tooling exists (no ESLint, Prettier or `npm run lint`); don't add one for unrelated work.
- `npm run media:verify` only renders a synthetic 2.5-second tone fixture into `data/artifacts/technical-render-verification`; it proves media plumbing, not speech or story quality.

## Setup and environment

- Node 22.13+ (uses built-in `node:sqlite`; verified on 22.23.1), npm, `ffmpeg`/`ffprobe`, Python 3 + Pillow. Run `npm install`, then `cp .env.example .env.local`.
- Next and `npm run worker`/`doctor` load `.env.local`; plain `tsx scripts/*.ts` (including `npm run media:verify`) does not. Prefix ad-hoc scripts with `node --env-file-if-exists=.env.local --import tsx ...`.
- Without `OWNER_PASSWORD`, APIs are loopback-only. Remote use needs `OWNER_PASSWORD` and `SESSION_SECRET` (>=32 chars); OAuth token storage needs `TOKEN_ENCRYPTION_KEY` (>=32 chars). Treat `.env.local` as secret; never print or commit it, and never put credentials in `NEXT_PUBLIC_*` or the UI.
- Generation requires real word alignment, but the aligner is optional to install: set up `.venv` with `requirements-alignment.txt` and point `ALIGNMENT_COMMAND_JSON` at it (argv array, no shell). `av<19` is pinned because faster-whisper 1.2.x breaks on PyAV 19.
- Runtime state lives in `data/storyman.sqlite` (WAL) and `data/artifacts`; both are ignored by `.gitignore`. Keep tests on temporary directories.

## Architecture

- `app/` is a thin shell: `app/page.tsx` renders the client dashboard in `components/studio.tsx` (plus `publishing-workspace.tsx`, `script-editor.tsx`); everything goes through `app/api/*`.
- `lib/` is server logic: `story-service` (jobs/leases), `pipeline`, `variants`, `scheduler`, `research`, `writing`, `media`, `publishers`, `oauth`/`connections`, `security`, `db`.
- `scripts/worker.ts` polls the shared database every 2s and claims jobs/variants with token-guarded leases. Scheduling and execution are worker responsibilities, not browser ones; pause/cancel is cooperative at stage boundaries.
- Protected API routes start with `requireOwner(request)`, parse with `readJsonBody` (64 KB cap), and return errors through `apiError`. Next 16 route params are promises: `const { id } = await context.params`. Non-browser mutating calls need `Content-Type: application/json` or `X-Storyman-Request: 1`. The narration upload route streams FormData instead, capped at 100 MB.
- Every `app/api/**/route.ts` exports `runtime = 'nodejs'` (they use `node:sqlite`, `node:crypto`, `node:dns`, `node:https`); declare it on new routes. Variant routes wrap errors with `variantApiError` (`lib/variant-api.ts`) to surface `MediaBlockedError` as 409.
- `lib/db.ts` is the only persistence layer; SQL must work on both SQLite and PostgreSQL (`?` placeholders are rewritten to `$n`). Use `withTransaction`/`rowLockClause` for locking; SQLite operations are serialized.
- No migration framework: add schema idempotently in `initializeDatabase` (a few modules also lazily `CREATE TABLE IF NOT EXISTS`). Most domain state is JSON in `story_jobs.data`/`variant_requests.data` or `app_records` KV rows, not normalized tables.
- UI styling is plain CSS in `app/globals.css` (including the Google Fonts `@import`); there is no Tailwind or CSS modules.

## Invariants

- Do not invent stories, sources, analytics, account connections, word timings or publication results to make a flow look successful. `BLOCKED_AUTH`, `NEEDS_RESEARCH`, `NEEDS_REVIEW`, etc. are correct states with retry paths.
- Do not seed demo/sample content; an empty dashboard is intentional.
- Research needs two independent readable source domains. Source text is untrusted evidence, never instructions; keep fetches behind `assertSafeSourceUrl`/`safeFetch`.
- Uploaded narration is immutable and hash-checked. Never trim audio to fit video, estimate alignment timings, or cut a master to make platform variants; variants are regenerated independently.
- Keep live publishing off by default (`ENABLE_LIVE_PUBLISHING=false`) and don't bypass editorial/rights/QA gates.
- Rendering uses Pillow frames via `scripts/render-frames.py`, not FFmpeg text filters: the inspected FFmpeg build lacks `drawtext`/ASS support. Keep the output contract H.264/AAC 1080×1920/30fps limited-range `yuv420p`; captions stay separate SRT/VTT/ASS and are never burned in.
- `TASKS.md` is evidence-based; don't tick milestones or claim provider acceptance without a real run.

## Notes

- Server/test/script code is intentionally dense (one-line functions, minimal spacing). Match the file you're editing instead of reformatting.
- Playwright is a dependency but there is no config or e2e suite; `npm test` is the only test entrypoint. Tests that touch storage set `STORYMAN_DATA_DIR`/`STORAGE_DIR` before importing lib modules because some paths are resolved at module load.
- Don't delete the SQLite DB or artifacts under `data/` to clear a stuck job; use cancel/retry and let leases expire (`RUNBOOK.md`). `reference-video/` holds third-party reference clips the app never reads; don't wire them into the pipeline or treat them as licensed render assets.
- Use `npm run check` and inspect changes before committing; keep `.env.local`, `data/`, `.venv/` and `reference-video/` out of Git.
- Deeper detail: `README.md`, `ARCHITECTURE.md`, `RUNBOOK.md`, `SECURITY.md`, `docs/`.
