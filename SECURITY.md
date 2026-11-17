# Security model

Storyman is a single-owner workspace. No service has been authorized and no public upload was performed during development.

## Access

- `npm run dev` and `npm start` bind to `127.0.0.1`. Without `OWNER_PASSWORD`, APIs accept loopback hostnames and Next.js-generated loopback forwarding hops only; a public address anywhere in a proxy chain is rejected. Keep this local mode bound to loopback; never expose it through a tunnel or proxy.
- Set `OWNER_PASSWORD` and a random `SESSION_SECRET` of at least 32 characters for remote access. Terminate HTTPS and set `APP_URL` to the exact external HTTPS origin. Sessions carry the server-authorized owner role and expire after 12 hours. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS.
- Mutating routes compare browser Origin with the configured application origin and reject cross-origin actions. Originless simple-form submissions are blocked; non-browser callers use application/json or X-Storyman-Request: 1. An in-process rate limit caps requests; a single-owner login bucket prevents spoofed proxy headers from bypassing its attempt limit. JSON request streams are limited to 64 KB before parsing. A shared Redis rate limiter and a dedicated user/RBAC model are required before a multi-instance or multi-user release.
- Authentication and protected artifact APIs run on the server. UI gating is not the authorization boundary.

## Credentials

OAuth client secrets, AI/TTS keys, encryption keys and sessions are server-only environment variables. Never prefix them with `NEXT_PUBLIC_`. `.env*`, runtime data and media are ignored by Git.

`TOKEN_ENCRYPTION_KEY` must contain at least 32 random characters. OAuth credentials use AES-256-GCM with a fresh nonce for every write and are stored as individual encrypted records in the configured SQLite/PostgreSQL database. Keep this key separate from database and media backups. Losing it requires reconnecting accounts. Vault encryption is implemented but has not been verified against a real account in this environment.

OAuth flows use single-use, ten-minute, encrypted database state consumed atomically. Database leases serialize token refreshes across processes, and conditional updates prevent an in-flight refresh from restoring a disconnected account. Canva/Google/TikTok use PKCE; secrets and code verifiers are never returned to dashboard JavaScript. Google, Canva and TikTok refresh tokens rotate into encrypted storage. Facebook expiry requires reconnecting. Disconnect attempts the provider revocation endpoint and removes local credentials even if remote revocation fails; the response reports that distinction.

## External content and uploads

Source research accepts public HTTPS URLs, forbids embedded credentials and custom ports, checks every DNS answer and pins the connection to a validated public address. Private/loopback/link-local/mapped IPv6 targets are blocked; redirects are checked again and limited to four. Source responses are capped at 5 MB. Source requests discard Authorization and Cookie headers. Source content remains untrusted reference material, never instructions.

When OpenCode CLI writing is selected, the worker sends the curated source excerpts and writing instructions to the selected Zen cloud model. Each run starts in a temporary directory with a dedicated agent that denies all tools; project files are not attached and the child receives only the environment needed for OpenCode login. The temporary configuration is removed after the run. OpenCode's `--archived` sessions still remain in its own local session store, so source excerpts may persist there. The CLI response is treated as untrusted generated data and still passes JSON schema, source-reference and human review gates. A quota or provider failure can use the separately configured local writer; the job event records the provider used.

Narration uploads use an explicit size cap, magic-byte validation, ffprobe verification and hashed immutable originals. File paths are restricted to safe IDs and filenames. Downloads require owner authorization. Do not serve the runtime `data` directory as public static content.

## Publishing controls

No public upload can begin unless a platform adaptation manifest exists, the narrative is genuinely adapted, factual/editorial/rights and media QA checks are approved, metadata and visibility are explicit, per-post consent is true, the account token is available and publishing switches permit it. YouTube and Facebook also require `ENABLE_LIVE_PUBLISHING=true` and workspace publication enabled. These gates have offline tests; their live operation has not been verified.

Publication reservations are durable unique keys per platform and variant. Interrupted uploads retain the reservation and require inspection instead of blind re-upload. Upload response IDs are retained and public state is separate from processing/private state. TikTok currently produces a manual handoff; it cannot silently start a public Direct Post.

## Release prerequisites

Before exposing this application to the internet: review dependency/container scans, configure HTTPS and owner auth, restore-test encrypted backups, use durable PostgreSQL/object storage, centralize rate limits and secrets, review proxy trust settings, test OAuth callbacks with the real approved apps and run one authorized end-to-end staging/publication test for each enabled destination. Public publishing needs the owner's authorization. This development build is not a completed production security audit.
