# Delivery status

Status is evidence-based. Checked items describe implemented local behavior, not untested live service success. This application is **not production ready** until the outstanding real end-to-end acceptance and operations checks pass.

## M1 — Working shell and manual trigger — implemented; verification in progress

- [x] Empty-repository and environment inspection; reuse Node, Python and FFmpeg.
- [x] Next.js/TypeScript responsive Codex-inspired dashboard with create, queue, library, schedule, connections, publishing, analytics and settings views.
- [x] Parameterized SQL persistence with SQLite local fallback and configurable PostgreSQL adapter.
- [x] Typed/Zod inputs, persistent jobs/events, unique manual request keys and protected API routes.
- [x] Real research fetches and a precise evidence/provider blocker; no fake stories or publishers.
- [ ] Complete a manual story through real independent sources, factual approval, authorized LLM and narration.

## M2 — Verified narrative and real narration — implemented paths; acceptance blocked

- [x] Configured grounded writing provider, claim/source-reference and length gates, script artifacts. OpenCode Zen free CLI is the preferred writer with isolated tool-denied sessions; a configured local Ollama fallback handles Zen quota/provider failures, and draft activity records provenance.
- [ ] Complete a real source-backed draft through OpenCode Zen after its free usage limit resets. A small CLI JSON probe succeeded, then the live service returned HTTP 429; a simulated 429-to-local fallback test passed.
- [x] WAV/MP3 upload with 100 MB cap, byte signature validation, ffprobe duration, SHA256 and immutable master storage.
- [x] Configured TTS adapter, full-script chunk preservation, audio concatenation/normalization and completed-narration reuse.
- [x] Gemini TTS provider: `gemini-3.8-flash-tts`, configured voice (`Riko`) and style through the Interactions API, explicit `TTS_PROVIDER` override, OpenAI-compatible fallback, and offline request/extraction/fingerprint tests.
- [ ] Real Gemini synthesis acceptance: verify voice, style, pronunciation and duration with an actual credential and human listening. No Gemini credential exists in this checkout.
- [x] Actual optional faster-whisper word timestamp command; timestamp/confidence/script agreement gates and SRT/ASS/VTT output.
- [x] Missing alignment or insufficient confidence stops progression; no fake word timings.
- [x] Verified local Ollama structured writing plus local Zonos3 TTS connectivity; actual Tagalog smoke WAV and real faster-whisper small-model word timestamps pass automatic gates using Storyman’s own pinned Python 3.12 environment. Human pronunciation/fluency review remains pending.
- [ ] Complete and listen to a real source-backed five-minute Filipino/Taglish script/narration, including the uploaded Tony Tan Caktiong reference when supplied.
- [ ] Independent editorial fact review and measurable beginning/end speech alignment acceptance.

## M3 — Media and render — technical renderer verified; editorial media agent incomplete

- [x] MediaProvider contract and explicit Canva capability diagnostic.
- [x] Original documentary typography/abstract graphic renderer, aligned caption scenes, cover, scene manifest and original-art ledger.
- [x] Vertical documentary template v2: gold/red chrome, ribbon, seal, watermark, scene counter, adaptive 8–12fps motion, sentence-level beats from real word timings, verbatim stat/year/quote scenes, text-only research-source cards and a CTA close; validated 1080×1920/30fps limited-range `yuv420p` encode. No subtitles burned in.
- [ ] Visually review the v2 template on a complete real story; synthetic preview frames prove layout and motion only.
- [x] Deterministic FFmpeg output checks: H.264/AAC, 1080×1920, 30fps, <=250ms duration drift; immutable narration hash preserved.
- [x] Real speech sample rendered from local Zonos audio and actual faster-whisper timestamps: `data/artifacts/zonos-smoke/master_long_9x16.mp4`, 11.933 seconds, 1080×1920/30fps H.264/AAC, zero measured duration drift; human listening/fluency review pending.
- [x] Real technical fixture render verified: `data/artifacts/technical-render-verification/master_long_9x16.mp4`, 2.5 seconds, 75 frames, H.264/AAC, zero audio/video duration drift. Synthetic tone and fixture caption; **not real speech alignment**.
- [ ] Verify actual authorized Canva assets/design exports or implement a licensed-stock acquisition provider.
- [ ] Cinematic B-roll relevance/era ranking, scene variety, licensed music/SFX/ducking, soundtrack/loudness/black-frame checks.
- [ ] Render and visually/listening-review a complete real five-minute story. Original graphic proof does not satisfy this acceptance.
- [x] Durable independent platform adaptation requests with new source-grounded short scripts, new narration/alignment/render, actual duration caps and file-backed editorial/rights review.
- [ ] Complete a real adaptation with authorized providers; selected-scene regeneration and full media editing controls.

## M4 — YouTube publish — adapter code; real authorization blocked

- [x] OAuth/configuration readiness and reviewed-variant publishing gates.
- [x] Resumable upload/status adapter with Shorts duration validation and duplicate-publication reservation.
- [ ] Real account scopes, app/project restrictions and current quota confirmed for this application.
- [ ] Complete <=180-second story adaptation and authorized upload with verified ID, permalink and public state.

## M5 — Facebook publish — adapter code; real authorization blocked

- [x] Page-token connection path and conservative 3–60s Reels validation.
- [x] Documented phase-based upload/status adapter and independent publication tracking.
- [ ] Verify account/API-version support and required Page permissions/app review.
- [ ] Complete adapted Reel and authorized upload with verified ID/permalink/public state.

## M6 — TikTok — guarded review/manual path; live acceptance blocked

- [x] OAuth configuration, actual creator-info query adapter and account-specific duration/privacy validation.
- [x] Explicit consent and manual privacy metadata validation; no default privacy in API contract.
- [x] Ready-for-manual-TikTok-post state when Direct Post eligibility is unverified.
- [ ] Real authorized creator-info response, editable preview/disclosures and owner handoff acceptance.
- [ ] Verify app audit/intended-use eligibility before implementing/enabling Direct Post.

## M7 — Schedule — durable local implementation; end-to-end recovery open

- [x] Three persisted default slots (`09:00`, `14:00`, `19:00`, `Asia/Manila`) with enable controls, rotation and destinations.
- [x] Separate generation/publication modes; schedule starts paused and live publishing disabled.
- [x] Deterministic occurrence idempotency, independent manual requests, bounded missed-run policies, worker heartbeat and SQL leases.
- [x] Same shared research/script/audio/render pipeline for manual and schedule triggers.
- [x] Pause/cancel/retry/resume at stage boundaries, preserving uploaded originals/artifacts.
- [x] SQLite jobs/schedule survive a fresh Node process; separate worker processes obey a single active slot; stale lease tokens cannot write/renew/release replacement work.
- [ ] Prove PostgreSQL restart recovery/multiple workers and repeated fault injection.
- [x] Normalized entity reservations plus story-title fingerprints; repeat entity reservation is rejected while retries of the owning job remain valid.
- [ ] Event/semantic topic deduplication beyond these deterministic fingerprints.
- [ ] BullMQ/Redis migration, robust exponential retry/DLQ/operator alerts and production concurrency proof.
- [ ] Non-negotiable acceptance: complete manual video while schedule enabled, then a different sourced scheduled story without changing the three slots.

## M8 — Production hardening — partial

- [x] Local-loopback default; optional owner session, CSRF checks, rate limits and protected artifacts.
- [x] Encrypted OAuth token vault, state/PKCE, source-URL SSRF defenses and no browser credential exposure.
- [x] Environment template, environment doctor, architecture/security/compliance/runbook documents.
- [x] Docker target for app/worker/PostgreSQL and persistent volumes (configuration only).
- [x] Typecheck, 64 targeted tests, production build and responsive desktop/390px browser review passed after integration. No horizontal overflow was observed in the stable mobile view.
- [ ] Full normalized schema/migrations, centralized RBAC/rate limiting, S3 protected storage, lifecycle management.
- [ ] Real provider cost metering and enforced monetary budget, observability/error tracking/alerts.
- [ ] Authorized analytics APIs; unsupported metrics must remain unavailable.
- [ ] Container/dependency security scan, deployed monitoring, TLS, backup/restore and rollback drill.
- [ ] Real cross-platform publication acceptance with owner authorization; no public posts or deployment performed.

## Exact next actions

1. Review reliable independent source evidence and the preserved story draft, then approve a factually sound five-minute narrative. OpenCode Zen free usage currently returns HTTP 429; local Ollama is configured and verified as fallback.
2. Generate and listen to the complete TTS narration, review Filipino/Taglish pronunciation and first/last word alignment, and inspect the full rendered video.
3. Connect each developer app/account with required scopes. Verify permitted Canva/media rights.
4. Build and review complete platform-specific narrative adaptations; authorize publication only at the final reviewed step.
5. Complete manual/scheduled/restart acceptance, real account publication checks and deployment/backup drills before calling the system production ready.
