# STORYMAN — Master TODO and Technical Implementation Plan

**Baseline:** 2026-11-17
**Project:** Storyman AI Story-to-Video Automation
**Status:** Implementation specification. The Story Card HTML referenced in the source brief is a UI prototype; Storyman's backend pipeline is only partially implemented.

This file is the working TODO. Storyman's own acceptance history is tracked separately in `TASKS.md`; keep both consistent when an item here is ticked there.

## 0. Reconciliation with the current checkout

Measured against this checkout on 2026-11-17 (Asia/Manila), so the spec above is grounded rather than assumed:

- **Writing:** `WRITING_PROVIDER=opencode-cli` with `OPENCODE_MODEL=opencode/glm-5.3-flash-free` is already implemented in `lib/writing.ts`. It shells out to `opencode run --standalone --archived --agent story-writer --format json` from an isolated temp directory, denies every tool action, parses the JSON event stream, and falls back to `AI_BASE_URL`/`AI_MODEL` (native Ollama today) on Zen quota/provider errors while recording that provenance on the job. This differs from the spec's `POST /session` HTTP design: the CLI path is verified working, the HTTP session path is not. See §1 for the decision.
- **Narration:** `TTS_BASE_URL=http://127.0.0.1:1919/v1`, `TTS_MODEL=zonos3`, `TTS_VOICE=default_7fe076568a17f68e`, `TTS_LANGUAGE=tl` are configured and a real `POST /v1/audio/speech` call returns WAV (16-bit mono 44.1 kHz). The spec's `/v2/generate` is **not** present on this host; only the OpenAI-compatible `/v1/audio/speech` endpoint answers. Narration is one concatenated master per job, not per two-sentence card.
- **Canva:** `CANVA_CLIENT_ID`/`CANVA_CLIENT_SECRET` are present server-side and the OAuth provider exists in `lib/oauth.ts`, but `lib/media.ts` deliberately returns `CANVA_CAPABILITY_MISSING` for stock search/acquisition. Canva is a connection with a verified-but-unexercised token path, not a media source yet.
- **The two-sentence Story Card is not implemented.** Today the pipeline writes one `script.md`/`script.json` master, one narration file, one alignment JSON and one rendered MP4 per job. Cards (§4) are a new layer.
- **Doc drift to fix:** the spec says `GET /global/health`, `GET /doc`, `GET /provider`. On this host (OpenCode CLI v2.3.0 serving on `127.0.0.1:4096`) those three paths return `200 text/html` — the web UI shell — because unknown routes fall through to the SPA. Only `/openapi.json` is a real API route and it returns `401` without auth. Real, authenticated discovery goes through the OpenCode API when a server password/token is configured, or through the CLI (`opencode models`, `opencode auth list`). Treat a `200 text/html` body as "not an API response", never as a health result.

### Non-negotiable stack (unchanged)

| Responsibility | Required component | Integration target |
|---|---|---|
| Research planning + script generation | **OpenCode CLI + OpenCode Zen free models** | Local OpenCode server `http://127.0.0.1:4096/` on the user's own computer |
| Narration TTS | **ZONOS3-Mini** | Local inference server; Apple Silicon MLX recommended, default documentation port `1919` |
| Image and video asset source | **Canva** | Authorized Canva APIs / account-accessible designs, uploads, exports; stock-library coverage requires capability validation |
| Media processing | **FFmpeg** (Remotion optional for templated graphics) | Local rendering workers |
| Frontend | **Existing single-file Story Card HTML** | Extend rather than replace |
| Orchestration | Node.js/TypeScript job runner | Initial implementation; SQLite for initial persistence, add queue/service as warranted |

**Do not substitute** Gemini, paid narration TTS, or AI-generated video for the primary stack. Alternative fallbacks must be explicitly enabled by the user. Free OpenCode Zen models vary over time; **discover and select a currently available free model, do not hardcode an outdated model ID.**

### Intentional deltas from the source spec

1. **Writing transport.** Keep the verified CLI path as primary. Add HTTP session support only as a second, independently gated adapter (§1) — do not replace the working CLI path with an unverified HTTP flow.
2. **Two-sentence cards vs. whole-master media.** §4 cards are the deliverable unit for scripting, narration, SFX and visual briefs. The existing single-master render stays valid for the full-length video; card-level media becomes a second output with its own timeline. Do not silently cut a master to satisfy card boundaries.
3. **Health checks.** Use CLI-backed discovery until authenticated HTTP discovery is proven, then switch §1's health gate to the HTTP endpoint.

## 1. Model and engine integration contracts

### OpenCode story/research engine (required)

- Base URL for Storyman backend: `OPENCODE_BASE_URL=http://127.0.0.1:4096` (host-local; not reachable through an unrelated cloud process).
- Server startup (if not already running): `opencode serve --hostname 127.0.0.1 --port 4096`.
- Health check: `GET /global/health` **when it returns JSON** — a `text/html` 200 is the SPA and must be rejected. Until then, use the CLI-backed probes in §7 for the gate.
- API schema: `GET /doc` when authenticated; `GET /openapi.json` is the machine-readable fallback on this host and currently needs a server token.
- Model/provider discovery: `GET /provider` or `GET /config/providers` when authenticated; CLI fallback `opencode models | grep '<provider>/.*-free'` and `opencode auth list`.
- Job isolation: `POST /session` creates one OpenCode session per story generation job.
- Generation: `POST /session/{id}/message` with a valid text part, selected `providerID`/`modelID`, and agent settings as required by the installed OpenCode version; validate exact request/response against the running server's `/doc` schema.
- Require explicit selection of an available **OpenCode Zen free** model, track ID and version/cost where exposed; on catalog change, fail with informative state and let the user reselect.
- Separate prompts: `research` (source list and extracted factual claims) and `scriptwriter` (narration and story pacing) with schema-based validation.
- Extract actual assistant text from message parts, reject malformed payloads, retry limited failures, and store job logs and prompt versions.
- Security: keep server bound to loopback or require authentication for any wider exposure; proxy through Storyman backend (do not expose OpenCode execution API or secrets in the frontend).

**Current adapter (`lib/writing.ts`) to preserve:**
- `writingConfigured()` accepts `WRITING_PROVIDER=opencode-cli` + `OPENCODE_MODEL` with no API key.
- `runOpenCode()` writes a throwaway `opencode.json` declaring a `story-writer` primary agent with `permissions: [{action:'*',resource:'*',effect:'deny'}]`, runs with `--standalone --archived --format json`, streams stdout capped at 2 MB, kills on timeout (SIGTERM then SIGKILL), and scrubs the child env down to `PWD`, `NODE_ENV`, `PATH`, `HOME`, `OPENCODE_HOME`, `OPENCODE_API_KEY`, XDG vars, `LANG`/`LC_ALL`, `TMPDIR`, `NODE_EXTRA_CA_CERTS`.
- `parseOpenCodeEvents()` rejects any `tool` event, treats `provider.free-limit`/429 as the quota error, and only accepts accumulated `text` parts.
- Fallback is only taken when an `AI_MODEL` plus key/base URL is also configured, and sets `fallback: true` in the result so job events record that Zen did not produce the draft.

### ZONOS3-Mini narration engine (required)

- Install official native backend compatible with host; for Apple Silicon use MLX. Verify weights, local GPU/memory capacity, API health, voice settings, supported languages, and real audio output.
- Suggested separate local service: `http://127.0.0.1:1919` (verify actual configured port).
- Use documented compatible HTTP generation endpoint (`POST /v1/audio/speech` or `/v2/generate`, depending on selected runtime).
- Maintain stable voice ID / speaker reference and narrator style across all cards; preserve reference audio securely and only use authorized voices.
- Persist WAV/PCM outputs and metadata: file, sample rate, duration, voice ID, generation state.
- UI audio player must play the **actual generated file**. Browser SpeechSynthesis may remain explicitly labeled as preview fallback, not as completed ZONOS3-Mini integration.

**Verified on this host:** `POST http://127.0.0.1:1919/v1/audio/speech` with `{model:"zonos3", input, voice:"default_7fe076568a17f68e", response_format:"wav"}` returns `audio/wav`, 16-bit mono 44.1 kHz; a two-sentence probe measured 3.466667 s. `/v1/models` lists only `zonos3`. `/v2/generate`, `/generate`, `/speakers`, `/voices` are absent (404). Storyman's existing `resolveTtsConfig` already speaks this endpoint, so the ZONOS3 adapter is a configuration and validation task, not a new protocol.

### Canva visual library (required)

- OAuth sign-in; test available scopes and account plan/access.
- List/search **user-owned or user-shared designs** via supported API; list available uploaded assets / folders and export assets or designs where supported.
- Match search keywords from each card's visual brief to accessible images/videos; rank by meaning, orientation, quality, and licensing/status.
- Distinguish Canva **Uploads and designs** from Canva's **built-in stock media**: unrestricted stock search/download is NOT assumed to be supported through Connect API. If blocked, implement a user-approved selection/import workflow, without pretending an unavailable endpoint works.
- Save Canva asset IDs, attribution/license metadata where relevant, export URLs and local cached files. Respect expiry of time-limited download URLs.
- Support choosing alternative visual assets and a missing-asset/manual-upload state.

**Current state:** `lib/oauth.ts` defines the Canva provider with scopes `asset:read`, `asset:write`, `design:content:read`, `design:content:write`, `design:meta:read`, Basic-auth token exchange and revoke; `lib/connections.ts` blocks with `CANVA_CAPABILITY_MISSING`; `lib/media.ts`'s `CanvaMediaProvider` throws for `search`/`acquire`. The capability matrix, not the OAuth flow, is the gap.

## 2. End-to-end automation

`Manual prompt / scheduled trigger`
→ `OpenCode research planner (sources + verification)`
→ `OpenCode scriptwriter (creative direction + source-backed narration)`
→ `JSON schema validation and 2-sentence card splitting`
→ `ZONOS3-Mini narration per card`
→ `Canva asset search / selection / export within permitted API coverage`
→ `SFX library or local generated SFX per card`
→ `forced alignment + media timing`
→ `FFmpeg render and audio mix`
→ `QC + playable 9:16 MP4 + story JSON`.

Research must be driven by actual, independently fetched/cited sources when factual claims are made. **An LLM response is not itself a verified research source.** When no retrieval capability is configured, show research as unavailable and allow user-provided sources or fiction-only mode.

## 3. Where the pipeline stands today

Implemented in this checkout (`lib/pipeline.ts`, `lib/media.ts`, `lib/scene-plan.ts`):

- Real research fetch + two-independent-domain gate, source SSRF defenses.
- Grounded script via OpenCode CLI Zen (preferred) → structured JSON → claims with exact source URLs → word-count and one-shot correction gate.
- Editorial approval gate, immutable uploaded-narration path, transcript-authoritative mode.
- Zonos3 narration synthesis, chunked concat, loudness normalization, SHA256, immutable narration records, reuse cache.
- faster-whisper alignment with confidence/script-agreement and first/last-sentence checks; SRT/ASS/VTT captions.
- Pillow frame renderer (no FFmpeg `drawtext` in this build), original gold/red documentary template, per-job scene manifest, asset ledger, media QA.
- Durable independent platform variants with new narration/render per variant.
- SQLite persistence, worker leases, three paused schedule slots, encrypted OAuth token vault, owner session/CSRF/rate limits.

Not implemented (this file's backlog):

- Two-sentence Story Card persistence and card-level media (§4).
- Canva as a real image/video source (§1, Phase 3).
- SFX per card (§4 `sfx_*`, Phase 2).
- Per-card regenerate and timeline re-render (§4 rules, Phase 4).
- Card-level JSON import/export as the primary interchange format.
- OpenCode HTTP session adapter (§1) and authenticated health gate (§7).

## 4. Story Card contract

Every Story Card MUST hold:

- `scene_id`, `ordinal`, `sentence_1`, `sentence_2`
- `narration_text` = sentence 1 + sentence 2 in original order
- `voice_id`, `tts_status`, `tts_audio_path`, `tts_duration_ms`
- `sfx_prompt`, `sfx_path`, `sfx_status`, `sfx_gain_db`
- `canva_search_terms`, `canva_asset_id`, `canva_asset_type`, `visual_path`, `visual_status`
- `subtitle_words[]` with precise `start_ms`/`end_ms`
- `render_path`, `duration_ms`, `scene_status`, `error_message` and source references

Rules: Exactly two complete sentences, no silent content dropping, no duplicate sentence IDs, no auto-filler. If the overall script has an odd sentence count, return it for editing or regenerate; never invent a sentence automatically. Regenerate a single scene without invalidating unrelated cards, except where timeline duration changes require downstream re-rendering.

**Sentence splitting must not reuse `splitForSpeech`.** That helper splits on `(?<=[.!?])\s+|\n{2,}` and then merges by character budget — it is a TTS chunker, not a sentence boundary parser, and it will mis-split abbreviations, decimals and quotes. Add a card-specific splitter with tests for: abbreviations (`Mr.`, `Dr.`, `vs.`, `e.g.`), decimals (`3.5%`), ellipses, quoted sentences, Taglish code-switching, and abbreviation-final sentences.

## 5. Prioritized implementation checklist

### Phase 0 — Local environment and API proof-of-connectivity

- [ ] Inventory actual OS, CPU/GPU, RAM, Python, uv, Node, FFmpeg and OpenCode CLI installation. (Done informally 2026-11-17: Darwin arm64, 16 CPUs, 48 GiB, Node 22.23.1, FFmpeg 9.0.2, OpenCode CLI v2.3.0, Zonos3 service live on 1919 — fold into `npm run doctor`.)
- [ ] Verify OpenCode is running on `127.0.0.1:4096`; `GET /global/health` succeeds. (Blocked: the path returns the SPA shell. Decide between authenticating the server or accepting CLI-backed discovery as the gate, then record the choice.)
- [ ] Inspect `GET /doc`, discover provider and free model inventory; select an enabled working Zen model. (Partly done via `opencode models`; must be re-verifiable at runtime, not hardcoded.)
- [ ] Smoke-test one actual OpenCode session + storywriting response via API. (CLI path done; HTTP `POST /session` + `POST /session/{id}/message` not yet done.)
- [ ] Install/launch ZONOS3-Mini on a separate local port and synthesize a real two-sentence WAV file. (Done 2026-11-17: 3.466667 s, 16-bit mono 44.1 kHz, `audio/wav`.)
- [ ] Confirm Canva integration authentication and exactly which user media/design scopes work. (Blocked: token exchange implemented, no live authorized probe recorded.)
- [ ] Record real integration results and blockers in `docs/integration-matrix.md`. (New file; `docs/ENVIRONMENT.md` holds the raw notes today.)

**Gate:** All three services have verified access paths, or explicitly tracked blockers with tested local fallback behavior.

### Phase 1 — Story Director, backend, data model (FIRST feature milestone)

- [ ] Preserve and modernize existing Story Card UI: responsive, uniformly sized, duplicate-safe, with functional audio controls and 9:16 preview area.
- [ ] Add the top Story Director component: topic, creative brief, format, language, duration, intended viewer, storyteller style, mode.
- [ ] Add OpenCode connection status and available free model dropdown (backed by server discovery).
- [ ] Implement a Node.js backend proxy for `research`, `generate-script`, `stories`, `scenes`, `models`, and job status.
- [ ] Implement source retrieval or source-input capability and clearly report verifiable sources. (Partly present: `lib/research.ts` fetches and gates; needs an explicit "user-supplied sources" and "fiction mode" path.)
- [ ] Define a structured creative system prompt: hook → setup → conflict → escalation → twist/payoff → ending/CTA.
- [ ] Generate valid structured story JSON and a user-editable full TTS script. (Present as one master document; needs card-shaped output.)
- [ ] Validate exact 2-sentence chunks using robust sentence boundary parsing; account for abbreviations and punctuation. (§4 note: do not reuse `splitForSpeech`.)
- [ ] Auto-populate cards in order, preserving edits, SFX, and visual briefs separately.
- [ ] Implement JSON save/load/export/import and local persistence.
- [ ] Verify manual generation with **actual OpenCode API results**; mocked tests are supplementary only.

**Gate:** User enters one topic, receives a researched/story-led full script, reviews/edits it, and gets correctly populated 2-sentence cards plus valid JSON.

### Phase 2 — ZONOS3-Mini narration + sound effects

- [ ] Build local ZONOS3 client/adapter and configurable service endpoint. (Adapter already exists via `resolveTtsConfig`; needs a first-class `TTS_PROVIDER=zonos` name, per-card invocation and a real connection probe.)
- [ ] Generate audio for all two-sentence cards, with consistent voice settings.
- [ ] Bind generated audio to the existing audio players with real duration and seek.
- [ ] Ensure script edits invalidate only that scene's stale narration and timestamps.
- [ ] Implement SFX selection from a local licensed library or explicitly approved SFX generator; keep optional upload.
- [ ] Implement timeout/retry/cancel/caching per scene. (Per-job caching exists via `narrationFingerprint`; per-scene is new.)
- [ ] Record real duration and normalize narration loudness. (Per-job loudnorm exists; per-scene normalization is new.)

**Gate:** Each card has reproducible, playable ZONOS3-Mini audio and functional SFX or an explicitly unresolved SFX state.

### Phase 3 — Canva visual sourcing and scene preview

- [ ] OAuth connection UI and token refresh (backend only). (Refresh path exists in `lib/oauth.ts`; verify it against a live token.)
- [ ] Implement accessible Canva design / uploaded-asset enumeration and search.
- [ ] Build semantic scene-to-asset match rankings and user override controls.
- [ ] Test exporting and caching an actual image and video from Canva within account permissions.
- [ ] Implement manual asset picker/import where stock-media APIs cannot provide a direct file.
- [ ] Auto-fill each scene's 9:16 preview with actual footage/image; letterbox/crop gracefully.
- [ ] Store provenance, reuse policies, and render-ready local paths.

**Gate:** Multiple story cards are populated with real Canva-origin media that can be rendered; unavailable library content is surfaced honestly.

### Phase 4 — Video assembly and subtitle timing

- [ ] Use measured TTS duration as the timing source of truth. (Already true for the master: `narration.duration` drives render; extends to cards.)
- [ ] Generate word timing through a tested forced aligner/transcription service and validate against narration. (Implemented via `scripts/align.py` + `validateAlignment`.)
- [ ] Build a continuous video timeline from scenes (image pan/zoom for stills, trimmed video for footage). (Master template does per-scene motion; card-based footage is new.)
- [ ] Add karaoke-style word highlighting, transitions, and synchronized SFX with adjustable ducking. (Word-level karaoke and SFX ducking are new.)
- [ ] Render local 1080x1920 MP4 (H.264/AAC unless another preset is selected) using FFmpeg. (Implemented; contract is H.264/AAC 1080x1920/30fps limited-range `yuv420p`.)
- [ ] Implement preview, single-scene re-render, progress, and final MP4 download/export.
- [ ] QA: audio-video sync, sentence coverage, volume levels, no blank frames, portrait resolution. (Deterministic probes exist in `lib/media.ts`; add card-level coverage checks.)

**Gate:** One complete topic produces a playable synchronized portrait MP4 plus reproducible source JSON.

### Phase 5 — Automatic unattended generation

- [ ] Add manual/scheduled trigger modes, schedule configuration, and concurrency limits. (Three paused slots + concurrency limit exist.)
- [ ] Persist topic history and story fingerprints to avoid duplicated ideas or repeated content. (Title fingerprint dedup exists; semantic dedup is open.)
- [ ] Find new topics, then perform research and generate story automatically via OpenCode.
- [ ] Add durable queue/job state, checkpoints, resume/retries, and idempotency keys. (Leases, idempotency keys and bounded recovery exist; no DLQ.)
- [ ] Enforce model usage/cost limits, external request limits, and media-cache quotas. (Budget is a settings number, not enforced metering.)
- [ ] Add notifications or operation logs for successful output and failed scenes.

**Gate:** Scheduled production can finish without UI interaction, recover from transient errors, and avoid repeating previously generated content.

### Phase 6 — Production hardening

- [ ] Environment-based config, secrets management, and health checks for all local services.
- [ ] Test offline/failed OpenCode, failed ZONOS3, expired Canva authorization, API rate limit, and missing media.
- [ ] Add unit tests for chunking/schema, integration tests using live services, E2E render test, and mobile UI tests. (`npm test` is the only entrypoint; no Playwright suite exists.)
- [ ] Ensure errors do not silently mark a scene or full video complete.
- [ ] Document installation, API setup, process supervisor, backups, logs and support runbook. (`README.md`, `RUNBOOK.md`, `SECURITY.md`, `docs/` exist; need Zonos3/Canva/OpenCode specifics.)
- [ ] Implement export retention cleanup and documented rollback strategy.

**Gate:** Verified clean install → one-topic MP4 render, plus verified scheduled run and error recovery.

## 6. Current UI baseline and gap

The existing Story Card prototype **has**: a single card with editable two-sentence narration, browser SpeechSynthesis preview, local SFX previews, audio uploads/playback, duplication, and a blank portrait video placeholder. It exposes `window.storyCards.bindAudio(...)` for attaching audio URL(s).

It **does not yet prove**: a connected OpenCode API, a researched Story Director, Zonos3 audio generation, authenticated Canva media sourcing, a persistent scene database, or a rendered MP4. Those remain TODOs.

Storyman's own dashboard (`components/studio.tsx`) is a separate, working app surface. The card prototype is not wired into it. Decide whether the card UI becomes a Storyman view or remains standalone; record the choice in `docs/` and do not maintain two divergent scene models.

## 7. Immediate developer acceptance tests

1. `curl -fsS http://127.0.0.1:4096/global/health` returns a healthy response **on the user's machine**. (Currently returns the SPA HTML shell, not JSON — see §0. Fix the gate or the server.)
2. `curl -fsS http://127.0.0.1:4096/doc` returns OpenAPI documentation. (Currently HTML; `/openapi.json` is the JSON route and needs a token.)
3. `curl -fsS http://127.0.0.1:4096/provider` returns real configured providers/models (authenticate if configured).
4. Storyman can create an OpenCode session and receive valid output from an actual, currently enabled free Zen model. (CLI path satisfies the intent today; HTTP session path is unverified.)
5. One ZONOS3 Mini two-sentence speech request returns a real playable audio file. (**Pass** 2026-11-17: 3.466667 s WAV via `POST /v1/audio/speech`.)
6. Canva authorized access lists a design or image/video asset and exports a renderable permitted item. (**Blocked**: no live authorized probe.)
7. Run a script-generation E2E test: sources → full script → exact two-sentence cards → saved JSON.

**Definition of done (project):** One topic or approved scheduled trigger produces a sourced narrative, exact 2-sentence scenes, real ZONOS3 narration, permitted Canva visuals, aligned captions/SFX, valid portrait MP4, and inspectable story/scene metadata. No mocked services may be presented as completed integration.

## 8. Security and operational constraints

- **Canva credentials were shared in plaintext in chat on 2026-11-17.** Rotate `CANVA_CLIENT_ID`/`CANVA_CLIENT_SECRET` before any live authorization. `.env.local` is gitignored; never print or commit it, and never put credentials in `NEXT_PUBLIC_*` or the UI.
- `CANVA_TOKEN_ENCRYPTION_KEY` and `CANVA_TOOL_SIGNING_SECRET` are **not referenced anywhere in this codebase**. Do not wire them in speculatively; if a tool-signing flow is genuinely needed, design it first and test it.
- The OpenCode writing agent must keep every permission denied. Do not relax `permissions: [{action:'*',resource:'*',effect:'deny'}]`, do not remove `--standalone`, and do not pass TTS/OAuth secrets into the child environment.
- Source text is untrusted evidence, never instructions; keep fetches behind `assertSafeSourceUrl`/`safeFetch`.
- Live publishing stays off by default (`ENABLE_LIVE_PUBLISHING=false`); never bypass editorial/rights/QA gates.
- Do not invent stories, sources, analytics, connections, word timings or publication results. `BLOCKED_AUTH`, `NEEDS_RESEARCH`, `NEEDS_REVIEW`, `CANVA_CAPABILITY_MISSING` are correct states with retry paths.

## 9. Verified reference docs

- OpenCode HTTP API (V1 doc; V2 is authoritative): https://opencode.ai/docs/server/
- OpenCode model selection: https://opencode.ai/docs/models/
- OpenCode Zen model inventory: https://opencode.ai/docs/console/models/
- Zyphra ZONOS3 Mini: https://github.com/Zyphra/ZONOS3-Mini
- Canva developer REST API: https://www.canva.dev/docs/apps/rest-apis/reference/
- Canva assets docs: https://www.canva.dev/docs/apps/uploading-assets/
- Canva designs list/search: https://www.canva.dev/docs/apps/rest-apis/reference/designs/list-designs/

## 10. Change log

- 2026-11-17: Initial TODO, reconciled against this checkout. Recorded measured OpenCode (4096), Zonos3 (1919) and Canva capability state; flagged the 2-sentence card layer, the `/global/health` HTML-shell problem, and the unused `CANVA_TOKEN_ENCRYPTION_KEY`/`CANVA_TOOL_SIGNING_SECRET`.