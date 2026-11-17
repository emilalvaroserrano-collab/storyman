# Storyman

A personal story-production workspace with a responsive, Codex-inspired dashboard. Create manual jobs, manage three daily schedules, inspect source-backed research and pipeline events, upload narration unchanged, and prepare reviewed videos for connected destinations.

**Current status:** runnable local application; real external integrations and end-to-end production acceptance are still blocked by account/provider configuration and unverified editorial/media workflows. This release must not be called production ready. No sample stories, invented analytics, connected accounts or published links are seeded.

## Run locally

Requires Node 22.13+ (Node 22.23.1 was inspected), npm, Python 3 with Pillow, FFmpeg and ffprobe. SQLite runs locally without an additional database service.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210). In a second terminal, start the persistent worker:

```bash
npm run worker
```

The worker runs separately from the browser and web server. The schedule starts paused with the default `09:00`, `14:00`, `19:00` Asia/Manila slots; enable it in Scheduler after checking providers. Manual jobs have independent idempotency keys and never consume schedule slots. Generation and publication settings are separate. Live publishing starts disabled.

## Configure real production providers

Use server-only `.env.local` values from [.env.example](.env.example); do not paste credentials into the dashboard or chat.

- **Research:** public Wikipedia discovery plus readable source documents; two independent source domains are required. User reference URLs pass SSRF protections. Discovered text is evidence, never an instruction. A retrieved page is not proof of every generated claim.
- **Writing:** `WRITING_PROVIDER=opencode-cli` uses an available OpenCode Zen free model. `/api/models` discovers current IDs and the Story Card page lets you select one per job. The worker runs an isolated, tool-denied CLI session, validates the selected ID against the current catalog, parses its JSON event stream and records model provenance. Free model availability and quota vary. An alternate `AI_BASE_URL`/`AI_MODEL` writer runs only when `ALLOW_WRITING_FALLBACK=true`; the default is disabled. Claims must reference fetched sources, and factual review remains required.
- **Narration:** `TTS_PROVIDER=zonos`, `TTS_BASE_URL=http://127.0.0.1:1919/v1`, `TTS_MODEL=zonos3`, and a speaker ID from `/v2/speakers` use the local ZONOS3-Mini service. Individual Story Cards synthesize actual WAV files, normalize loudness, and attach real audio to the existing player. Editing a scene invalidates only that scene's speech and timing. Alignment is independently verified; failed transcript agreement leaves the scene in review. Uploaded WAV/MP3 masters are immutable. Gemini and other TTS providers are never selected merely because a credential exists; they require an explicit `TTS_PROVIDER` choice.
- **Alignment:** install the optional requirements below and configure `ALIGNMENT_COMMAND_JSON`. The included `scripts/align.py` uses faster-whisper word timestamps with actual model probabilities. The inspected Storyman Python 3.12 environment is pinned in `requirements-alignment.lock.txt`; PyAV stays below 19 because the current faster-whisper API requires it. Missing/low-quality alignment stops the pipeline; no estimated karaoke timings are generated.
- **Canva / social accounts:** configure developer application credentials and encrypted token storage, then authorize each account under Connections. The ChatGPT Canva connection is not automatically an app OAuth credential. Canva stock-library search and arbitrary video editing are capability blockers unless a permitted workflow is verified.
- **Publishing:** owner approval, licensed reviewed platform-specific variants, platform account access and `ENABLE_LIVE_PUBLISHING=true` are required. Independent platform narratives can be queued, synthesized, aligned, rendered and manually reviewed; no complete adaptation has passed a real provider/account acceptance test. TikTok uses a manual handoff while Direct Post eligibility remains unverified.

Optional alignment setup (Python 3.11/3.12 recommended if wheels are unavailable for the host Python):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-alignment.txt
```

Set `ALIGNMENT_COMMAND_JSON` to an argv array using the absolute `.venv/bin/python`, `scripts/align.py`, `--audio`, `{audio}`, `--output`, `{output}`. The first real run downloads the selected Whisper model.

## Documentary short template

The renderer targets the vertical version of the reference shorts: gold frame and red/white chrome, topic ribbon, brand seal, handle watermark, scene counter, a red progress line, huge kinetic typography, sentence-level cuts, text-only "research source" citation cards and a CTA close. Beats, stats, years and pull quotes come only from real aligned word timings; the support line always quotes spoken words, and a number is never invented or rounded. No subtitles are burned in — `captions.srt`, `captions.vtt` and `captions.ass` remain separate artifacts behind the master.

Artwork is original procedural geometry and typography drawn with Pillow. Third-party reference footage, stock clips, article screenshots, archival photos and likenesses are not reproduced; source cards show only a domain and title. Motion is sampled at 8–12 fps depending on duration (`RENDER_MOTION_FPS` overrides) and encoded to 30 fps. The output contract stays H.264/AAC 1080×1920/30fps with limited-range `yuv420p`, because publishers, QA, variants and tests depend on it. Independent short adaptations use their own complete source-grounded narrative and new narration; the master video is never cut.

## Verified local speech service

The existing local Zonos3 service at `http://127.0.0.1:1919` was inspected through its owning API documentation and live capabilities. A real Tagalog-language TTS smoke returned an 11.933-second PCM WAV and actual small-model word timestamps. The server advertises `tl` text normalization but no Tagalog-labeled default speaker was installed; the default AmericanMale voice was used. Word confidence and agreement passed automatic thresholds, with pronunciation/transcription differences still present. This proves local audio/aligner connectivity, **not human-verified Filipino fluency or complete story acceptance**. The local-only environment records the chosen service/voice without cloud keys.

A genuine speech render is available locally at `data/artifacts/zonos-smoke/master_long_9x16.mp4` ([protected preview](http://localhost:3210/api/artifacts/zonos-smoke/master_long_9x16.mp4)). It contains 11.933 seconds of actual synthesized speech with actual STT captions, H.264/AAC at 1080×1920/30fps, and zero measured audio/video duration drift. `speech_verification.json`, `words.json`, caption files and media QA are alongside it. This developer verification artifact is not seeded as a completed story in the app. It was rendered before the current documentary template, so it proves the audio/alignment/encode path, not the present visual design. Re-run the media portion with `node --env-file-if-exists=.env.local --import tsx scripts/verify-speech.ts` after its local narration/request artifacts exist.

## Commands

```bash
npm run check      # typecheck + tests + production build
npm run typecheck
npm test
npm run build
npm run start
npm run doctor
npm run media:verify
```

`verify-media.ts` deliberately creates a **2.5-second synthetic tone technical fixture**, uploads it through the media service and renders a 1080×1920 MP4. It verifies codecs, frame rate, audio/video duration and original-byte integrity. It is not a real story, real narration, research acceptance or speech alignment test.

## Independent platform adaptations

Create a YouTube, Facebook or TikTok variant from the Publishing center. A durable request reuses the source research while writing a complete independent hook, turning point, explanation, payoff and CTA. The worker creates new narration, real alignment and a separate video. YouTube targets 150 seconds with a 180-second cap; Facebook and TikTok target 50 seconds with a conservative 60-second cap. Actual measured narration over the cap stops for review and is never truncated. TikTok creator-specific limits are checked again during publishing review.

Completed QA-passed variants require explicit editorial/media-rights review through the protected review endpoint; it rechecks actual file hashes/codecs/duration. This approval does not grant publishing consent. Provider blockers remain visible and retryable. Regeneration creates a new independent adaptation and preserves the previous one. No real completed adaptation is claimed without a configured writing/TTS/alignment provider.

## Persistence and deployment

Local SQL records live in `data/storyman.sqlite`; uploaded originals and outputs live in `data/artifacts`. With `DATABASE_URL`, the same repository uses PostgreSQL. OAuth credentials and OAuth state are encrypted individually in SQL records. Back up the database, artifact directory and original encryption key together.

`compose.yaml` supplies app, worker and PostgreSQL, with optional Redis infrastructure. Copy the environment template to `.env`, set the required passwords/secrets and a Docker `POSTGRES_PASSWORD`, then use `docker compose up -d --build`. The checked-in Docker configuration has not been proven on a running Docker daemon in the inspected environment. Current queueing is implemented in SQL with leases; BullMQ/Redis scheduling, S3 object storage and Remotion are not implemented.

See [TASKS.md](TASKS.md) for milestone status, [ARCHITECTURE.md](ARCHITECTURE.md) for implementation boundaries, [RUNBOOK.md](RUNBOOK.md) for recovery, and [SECURITY.md](SECURITY.md) for access controls. Account-specific API limitations and publishing requirements are documented under `docs/`.
