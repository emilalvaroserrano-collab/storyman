# Local verification record

Reviewed on 17 November 2026 (Asia/Manila). This is a local development result, not a production acceptance report.

- `npm run check` passed: TypeScript, 64 Node tests and Next.js 16.4.6 production build. The final build has no application tracing warning. Node's built-in SQLite still emits its experimental-feature notice.
- The production server and separate worker started on loopback `127.0.0.1:3210`; the worker reported `online`. The saved schedule remained paused with the three 09:00, 14:00 and 19:00 Manila slots. Live publishing remained disabled.
- The responsive studio was inspected in a real browser at desktop width and 390 px mobile width. The stable mobile DOM measured `innerWidth=390` and `documentElement.scrollWidth=390`. Screenshots are in `docs/screenshots/studio-dark.jpg` and `docs/screenshots/studio-mobile.jpg`.
- The OpenCode v2.3.0 CLI listed Zen free models. One small `glm-5.3-flash-free` JSON prompt succeeded. Subsequent live Zen calls returned `provider.free-limit` HTTP 429. A live `writeStructured` call then invoked local Ollama `ornith-dev-128k:latest`, returned parseable JSON, and reported `fallback: true`. A test simulates the 429 event and verifies the fallback and provenance. This does **not** prove a complete source-backed story was written by Zen.
- A real 11.933-second Zonos3 Tagalog speech sample was synthesized, aligned with faster-whisper and rendered to H.264/AAC 1080x1920/30fps. Audio/video duration drift was zero in the sample. Automatic word metrics passed, while human pronunciation/fluency review remains pending. The local sample is under `data/artifacts/zonos-smoke/` and is not seeded as a completed story.
- The Tony Tan Caktiong/Jollibee research job saved four sources and a 572-word source-mapped draft. It remains `NEEDS_REVIEW`, editorial approval is false, and uncertainty plus length concerns remain. No narration or completed five-minute video is claimed.

Real Canva stock access, independent licensed media acquisition, full-length story QA, account OAuth, provider-side uploads, Docker execution, PostgreSQL multiworker recovery, analytics, and public posting remain unverified or incomplete. `TASKS.md` lists implementation and acceptance work separately.
