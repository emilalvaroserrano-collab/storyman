# Publishing review and platform consent

The application starts in GENERATE_ONLY mode. Generation schedules and publication settings are independent. Scheduled jobs do not provide permission to publish publicly.

## Common checks

1. The researched story has traceable sources and approved factual claims. No invented quote, private allegation, unsupported amount or reconstructed footage may be represented as documented history.
2. Narration, complete word alignment, captions and media QA have passed. Original uploaded narration remains unchanged. Review the rendered output and ending.
3. Every selected media/music asset has documented rights for the actual destination. Canva design export rights cannot be assumed to permit standalone stock extraction.
4. Produce a complete narrative adapted to each destination. A master upload cut off at a platform limit does not qualify.
5. Review the title, caption, disclosures, visibility, target account and intended publication time. Obtain explicit owner authorization for actual public posting.
6. Record the upload session/external ID and poll its returned state. PROCESSING, PRIVATE and READY_FOR_MANUAL_TIKTOK_POST are not verified public posts.

## YouTube

A Shorts variant is vertical and no longer than 180 seconds. The authorized channel, actual quota and app verification must be checked with the connected account. The upload adapter supports explicit private/unlisted/public visibility. Private or unlisted uploads are retained as PRIVATE in publication state and are not counted as public publication.

## Facebook Page Reels

Use a real Page token for the explicitly selected `META_PAGE_ID`. Initialize the Reel, upload its bytes to the provider-returned Meta host, then finish publication and verify the actual state/permalink. The implementation retains a conservative 3–60-second validation profile until longer durations are verified for the active API and Page. A five-minute Page video is a separate destination requiring its own implementation.

## TikTok

Open the publish workflow by querying current creator information. Show the creator nickname, current privacy choices, maximum duration and disabled interaction settings. Privacy starts unselected. The owner reviews the preview, caption/hashtags, commercial-content and AI-generated declarations, then provides explicit per-post consent.

The current implementation does **not** perform Direct Post. It returns READY_FOR_MANUAL_TIKTOK_POST for a reviewed eligible variant and preserves the MP4/caption for the official TikTok app. No unwanted promotional watermark is added. Direct Post implementation requires audit/intended-use verification and the full reviewed consent UI; adding a client key or toggling global auto-publish does not satisfy those requirements.

## Failure and recovery

A platform failure is independent of other platforms. Unique publication reservations prevent duplicate upload attempts. An interrupted upload with an external ID must be polled/resumed through its existing provider state; a missing ID requires account inspection before retry. The renderer's source artifacts and immutable uploaded narration remain available when publication fails.

There are currently no authorized accounts, genuine published post IDs, or verified publication URLs from this development session. No integration is marked live-complete.
