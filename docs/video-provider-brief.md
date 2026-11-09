# Video-provider decision brief (CM1, for the owner's decision at CM2 Prompt 1)

> **Superseded by D39 (owner, 3 November 2026):** public-course video uses the AQS-owned
> YouTube channel after AQS review; organisation-only video stays in private Supabase Storage.
> No paid video provider is used. This brief is kept as a record only.

**Prepared 3 November 2026. A decision brief, not a decision.** Prices were re-read on each
provider's own pricing page on 3 November 2026 (links below). The monthly costs are
**estimates** from those list prices and the assumptions stated; actual bills depend on real
usage. Nothing here has been purchased, configured or tested with a provider.

## What is being decided

Where course videos are stored and how they are delivered. Documents, thumbnails and downloads
stay on Supabase Storage in every option (audit section 14). Unlisted YouTube stays available
for public, non-sensitive courses (P16). The application talks to whichever provider is chosen
through one internal video record and one Edge Function, so the choice can be changed later.

## Today, and why it is not enough

Videos are uploaded straight to a private Supabase bucket and played as one MP4 file through a
15-minute signed URL. On the current Free plan every upload is capped at 50 MB
([Supabase pricing](https://supabase.com/pricing)). There is no adaptive quality for slow or
expensive mobile connections, no captions (WCAG 1.2.2, Level A), and no resumable upload.

## Options compared (list prices read 3 Nov 2026)

| | Supabase Storage Pro (keep MP4) | **Mux** | Cloudflare Stream | Bunny Stream |
| --- | --- | --- | --- | --- |
| Adaptive streaming (HLS) | No | Yes | Yes | Yes |
| Captions | None | Auto-generated captions free on demand, 22 languages | AI captions available; price not stated on the pricing page (unverified) | "Transcribe AI" listed; price not stated (unverified) |
| Resumable upload (from research notes, not re-read today) | Supported (TUS) but not built | Resumable direct uploads | Direct creator uploads (TUS above 200 MB) | TUS |
| Access control | Signed URL (15 min); Smart CDN may keep serving a cached copy after expiry on Pro (provider-documented) | Signed JWT playback (RS256); referrer restrictions; key rotation | Signed tokens up to 24 h; signing-key revocation invalidates all its tokens; `allowedOrigins` | Token authentication |
| Prices (list) | Plan $25/month; storage 100 GB incl. then $0.0213/GB; egress 250 GB uncached + 250 GB cached incl., then $0.09 / $0.03 per GB | Pay as you go: storage $0.0024/min (720p), $0.003/min (1080p); delivery $0.0008/min (720p) with the first 100,000 minutes/month free; basic input free; $20 monthly usage credit | Storage $5 per 1,000 minutes/month (prepaid blocks); delivery $1 per 1,000 minutes; encoding free; no free tier listed | Storage from $0.01/GB; encoding free; delivery $0.06/GB Middle East & Africa, $0.01/GB Europe & North America (standard network); $1/month minimum |
| Free tier | 1 GB storage, 50 MB per file, no backups, pauses after a week idle | 10 stored videos only | None | None |

Sources: [Supabase pricing](https://supabase.com/pricing) · [Mux pricing](https://www.mux.com/pricing) ·
[Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/) ·
[Bunny Stream pricing](https://bunny.net/pricing/stream/) · [Bunny CDN pricing](https://bunny.net/pricing/cdn/) ·
[Mux secure playback](https://www.mux.com/docs/guides/secure-video-playback) ·
[Cloudflare Stream security](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/).

## Estimated monthly cost (illustration, not a quote)

Assumptions: 3,000 minutes of video stored (about 50 hours of courses); 30,000 minutes watched
per month; 720p; about 2.5 Mbit/s (about 1.1 GB per hour) for the GB-priced options.

| Option | Estimate | Working |
| --- | --- | --- |
| Supabase Pro, MP4 | about $25 + $28 | Plan $25 (also needed for backups). About 560 GB delivered: 250 GB uncached included, about 310 GB at $0.09 |
| **Mux** | about $7 in list charges, possibly covered by the $20 monthly credit | Storage 3,000 × $0.0024 = $7.20; delivery within the 100,000 free minutes. Whether the credit offsets storage is **unverified** |
| Cloudflare Stream | about $45 | 3 storage blocks × $5 = $15; 30 × $1 = $30 |
| Bunny Stream | about $1–34 | About 560 GB delivered: $34 if served from African edges at $0.06/GB, about $6 at the Europe rate; storage under $1 |

Supabase Pro ($25/month) is needed for production backups anyway (RB2), whatever the video choice.

## Privacy and legal implications (all need RB1 legal review)

- Every option adds or extends a subprocessor that receives course videos and viewers' IP
  addresses (architecture plan DR8, DR11).
- **Mux:** offers a Data Processing Addendum and is self-certified under the EU–U.S. Data Privacy
  Framework; Mux Data (playback analytics) collects IP addresses (truncated after use), device
  details and a viewer ID, and keeps pseudonymised view data up to 100 days
  ([Mux privacy guide](https://www.mux.com/docs/guides/ensure-data-privacy-compliance)).
  Recommendation: send no names or emails, use an opaque internal viewer ID or turn Mux Data
  off. Where Mux stores video files is **not stated** on the pages read (unverified).
- **Cloudflare Stream:** global network; storage location and DPA terms not checked in this
  brief (unverified).
- **Bunny:** storage location and DPA not checked in this brief (unverified).
- No provider receives organisation names: only an internal asset ID (tenant isolation).

## A conflict to decide: the 15-minute rule (D20, P16)

D20 requires signed URLs that expire after 15 minutes. Mux states that playback stops when the
token expires "even if playback has already started" and recommends a token at least as long
as the video ([Mux](https://www.mux.com/docs/guides/secure-video-playback)). Cloudflare tokens
can last up to 24 hours. Two ways to keep D20:

1. **Keep 15-minute tokens** and have the player fetch a new token and resume at the same
   position before expiry (as today's MP4 player already does). More engineering in CM2; to be
   proven per provider.
2. **Amend D20 for video only:** token lifetime = video length plus a margin (for example, at
   most 4 hours), still checked by `media_access` at issue time. Simpler; weaker if a link
   leaks.

Recommendation: option 1 if it works reliably with the chosen provider in a CM2 spike;
otherwise bring option 2 back to you as an explicit D20 amendment.

## Recommendation

**Mux, pay as you go,** behind the provider-neutral interface: adaptive streaming, free
auto-captions, signed playback, lowest list cost at AQS's scale. **Alternative: Cloudflare
Stream** (simpler pricing, 24-hour token cap, origin restriction). Bunny is the budget option
but African delivery costs six times its European rate. Staying on Supabase MP4 is acceptable
only for short clips.

## Decisions needed at CM2 Prompt 1

1. **Video provider:** Mux (recommended), Cloudflare Stream, Bunny Stream, or Supabase MP4 only.
2. **Account:** an AQS-owned provider account (B1) for staging tests, with any card or billing
   set up by you.
3. **Token lifetime:** keep 15 minutes with refresh (recommended), or amend D20 for video.
4. **Caption policy:** for example, auto-captions reviewed by the instructor before publishing
   (recommended), auto-captions published directly, or captions optional.
5. **Playback analytics:** off, or on with an opaque viewer ID only.
6. **Storage plan:** Supabase Pro for staging now or at CM5 (needed for uploads above 50 MB on
   staging if Supabase MP4 remains in use).
