# API capabilities and verified boundaries

Last documentation review: 17 November 2026, Asia/Manila. Service accounts have **not** been authorized in this workspace. Implemented code and offline checks do not establish live integration readiness.

| Service | Implemented | Present blocker / boundary |
| --- | --- | --- |
| Canva | OAuth authorization code + PKCE, encrypted tokens, refresh/disconnect, scopes and actionable capability status | No whole-stock-library search/download is assumed. The renderer uses original graphics; actual permitted Canva design export/media selection is not integrated or live-tested. |
| YouTube | OAuth, channel identity lookup, resumable upload adapter, visibility and processing status verification | Requires OAuth client configuration, owner authorization, a reviewed <=180-second platform adaptation, and live acceptance test. No video has been uploaded. |
| Facebook | OAuth, explicit configured Page selection, three-phase Page Reels adapter, status/permalink polling | Requires approved Meta application, configured `META_PAGE_ID`, Page permissions/token, reviewed Reel variant and live acceptance test. Default variant validation is conservatively 3–60 seconds. |
| TikTok | OAuth, refresh/revoke, real creator-info query endpoint, explicit metadata/privacy/consent validation, honest manual handoff | No Direct Post is performed. App audit and intended-use eligibility are unverified. Each export must load creator info and manually select an allowed privacy setting. |
| Analytics | Actual locally persisted job counts and statuses | Views, retention, watch time, follower growth and actual provider cost are unavailable until authorized APIs and billing records are implemented. No engagement metrics are fabricated. |

## Official documentation reviewed

Canva documents server-side OAuth code flow with PKCE for public/private applications and a distinct client-credentials flow for service applications. Access to assets/designs does not establish standalone rights to download Canva Pro stock. The present adapter explicitly reports `CANVA_CAPABILITY_MISSING` for stock-library search/acquisition. See [Canva authentication](https://www.canva.dev/docs/apps/rest-apis/authentication/) and [REST APIs overview](https://www.canva.dev/docs/apps/rest-apis/).

YouTube requires an authorized upload scope for [`videos.insert`](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert). Quotas are project and method dependent and must be checked in the actual Google Cloud project before enabling unattended uploads; the code does not claim a project's remaining quota. The adapter records an uploaded video as PROCESSING, PRIVATE, or PUBLISHED based on returned provider state. See [YouTube web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

Meta documents initialization, binary upload, and finishing a Page Reel separately. Personal profiles and Instagram are not equivalent Page destinations. The implementation uses a versioned Graph API (`META_GRAPH_VERSION`, default v27.0), configured Page ID and Page token. See [Meta Reels publishing](https://developers.facebook.com/documentation/video-api/guides/reels-publishing) and [manual OAuth flow](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow).

TikTok requires a fresh [`creator_info/query`](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info) response when presenting export controls. Privacy options, interaction limits and maximum video length come from that response. [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post) requires explicit per-post consent and restricts unaudited applications; general schedule settings cannot replace the required user workflow. Token expiry values are read from the actual token response and refresh-token rotations are retained; see [token lifecycle](https://developers.tiktok.com/docs/en/oauth-user-access-token-management).

## Runtime / infrastructure boundaries

The default local database is SQLite with WAL; `DATABASE_URL` enables the PostgreSQL adapter. The persistent worker uses database polling and deterministic scheduler occurrence keys. Redis/BullMQ is not implemented and must not be reported as active. Local media is protected through authenticated API downloads; S3-compatible object storage is not implemented. Owner authentication is single-user; a full multi-user RBAC system is pending.

FFmpeg original graphics, complete narration preservation, measured word alignment and artifact creation are implemented as a development vertical slice. Licensed stock selection, music/SFX procurement, full black-frame/loudness QA, genuine platform narrative adaptations and real long-form acceptance scenarios remain pending. Read `TASKS.md` and `RUNBOOK.md` before enabling automation.
