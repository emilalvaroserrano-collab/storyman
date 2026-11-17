# Architecture

## Current implementation

- **Web:** Next.js App Router + React + TypeScript. A responsive client dashboard reads and mutates passwordless API routes; remote access must be restricted at the network or hosting layer. The interface uses actual persisted job/connection state rather than sample production data.
- **Contracts:** `lib/types.ts` defines job states, trigger inputs, settings, schedules and dashboard payloads. Zod validates server input.
- **Persistence:** `lib/db.ts` selects PostgreSQL when `DATABASE_URL` is configured, otherwise SQLite in WAL mode. Schema initialization creates SQL records, durable jobs, schedule occurrences and topic fingerprints. Several domain artifacts are stored as versioned JSON documents, rather than every normalized table from the master specification.
- **Worker:** a standalone TypeScript process polls the shared database, records heartbeats, claims main/variant jobs under a shared transactional concurrency lock with token-guarded leases, checks pause/cancel at stage boundaries, and invokes the same pipeline for manual and scheduled triggers. Browser tabs are not responsible for scheduling.
- **Research / narrative:** public discovery and SSRF-checked pages supply evidence to the preferred OpenCode Zen free model through an isolated, tool-denied CLI run. Its structured event output is parsed server-side; quota/provider failure falls back to the configured compatible writer, currently local Ollama, and model provenance enters job activity. Source-domain and claim-reference gates can stop unsupported work. These gates do not replace factual human review.
- **Audio:** WAV/MP3 originals are sniffed, probed, hashed and stored unchanged. Configured TTS uses sentence-safe chunks and FFmpeg concatenation/normalization. Gemini `gemini-3.8-flash-tts` is preferred when `GEMINI_API_KEY` exists, with the voice in `generation_config.speech_config` and the narration style as `speech_metadata` on the Interactions API; an OpenAI-compatible endpoint remains the fallback and `TTS_PROVIDER` overrides auto-detection. Narration cache fingerprints cover provider, model, voice, style, chunk size and credential scope. Actual STT word timestamps come from a separately installed aligner, with confidence/range/script agreement gates.
- **Renderer:** `lib/scene-plan.ts` turns validated word cues into contiguous scenes (opening, phrase, stat, timeline, quote, citation cards, CTA close) without inventing text or numbers. `scripts/render-frames.py` draws original procedural backdrops, gold/red chrome, kinetic type, text-only source cards and a cover with Pillow; FFmpeg muxes the immutable narration into H.264/AAC 1080×1920/30fps with limited-range `yuv420p` and writes the master MP4, scene manifest, asset ledger and media QA. Captions stay as separate SRT/VTT/ASS artifacts — none are burned in. Motion is sampled at adaptive 8–12 fps. No Canva stock, archival image, article screenshot or licensed soundtrack is claimed. Separate variant requests write independent source-grounded short narratives, synthesize new speech and run actual alignment/render checks; source masters are never cut.
- **Accounts:** OAuth state/PKCE and AES-256-GCM encrypted per-account SQL token records; configured applications must be authorized separately. Provider callbacks and refresh functions are server-side. Account access and app review cannot be verified without real authorized credentials.
- **Publishing:** destination adapters enforce reviewed, hashed platform variants and account access. Idempotent reservation avoids automatic duplicate uploads. API calls remain unverified against real accounts. TikTok preserves review/manual-post status where Direct Post approval is absent.

## Trace lineage

`prompt + trigger key → persisted job/events → sources → script/claim map → narration hash → word alignment → caption tracks → scene manifest + asset ledger → master MP4 + media QA → separately generated platform-specific narrative/audio/render variants → editorial/rights review → publish reservation/events/status (account verification pending)`

Narration originals and completed files are retained after a failed stage. Only invalid freshly uploaded files are removed when MIME/probe validation fails.

## Deliberate boundaries and remaining production work

The current local-first implementation uses SQL leases instead of BullMQ and local artifact storage instead of S3. PostgreSQL selection exists, but deployment, multi-worker concurrency and restore are not proven on production infrastructure. The repository's persistence adapter executes parameterized SQL directly. A dedicated Python worker service is not running; the TypeScript worker invokes an explicit real aligner command.

Budget settings are configuration and zero-budget gating, not authoritative provider-cost accounting. Claim validation is source-reference checking, not a proof engine. Topic deduplication uses normalized entity reservations and story-title fingerprints. It does not yet use event embeddings or semantic similarity. Full DLQ/backoff/alerting, normalized schema/migrations, source scoring, rights acquisition, cinematic scene selection, music/SFX, scene regeneration, analytics APIs and real provider/account acceptance of platform adaptations remain open. Do not infer these from the dashboard controls.

## Deployment shape

Local development: one Next process + one worker + SQLite/artifact directory. Docker target: one app + one worker + PostgreSQL + shared artifact volume. Reverse proxy/TLS, centralized rate limiting, object storage, monitored backups, error tracking and provider approval are needed before remote production deployment. No deployment or public publication has been performed as part of initial development.
