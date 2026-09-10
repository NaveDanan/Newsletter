# Community

The `/community` route is a full social platform inside the newsletter app: posts with images, video and link previews, threaded replies, likes, reposts, quotes, bookmarks, follows, blocks, profiles, hashtags, mentions, search, notifications and a moderation queue. It replaces the former `#community` marketing anchor and renders outside the marketing shell, with its own left rail, centre column and right rail.

Any signed-in account can take part, including the default `viewer` role. Anonymous visitors read everything that is public and get the sign-in prompt on any write, which is the same `handleRequireAuth` path the rest of the app uses. Moderation is limited to `manager`, `general_manager` and `admin`, and the client mirror of that rule is `canModerateCommunity` in `src/lib/auth/permissions.ts`.

## Routes

`src/lib/community-routes.ts` owns every path below `/community` and returns a canonical pathname that `src/App.tsx` replaces the URL with, so a reload or a shared link restores the same screen. There is no query-string state.

- `/community`, `/community/following` and `/community/latest` are the three feed tabs.
- `/community/post/<id>` is a thread: ancestors above, the post itself, then a page of replies.
- `/community/u/<handle>` is a profile, with `/posts`, `/replies`, `/media` and `/likes` tabs. The likes tab is readable only by the account owner and by moderators.
- `/community/u/<handle>/followers` and `/community/u/<handle>/following` are the connection lists.
- `/community/tag/<tag>` is a hashtag page and `/community/search/<type>/<term>` searches posts, people or hashtags.
- `/community/notifications` and `/community/bookmarks` require a session; the rails send an anonymous visitor to sign-in instead of navigating.

The moderation queue is not a community route. It is the `community` tab of the manager dashboard at `/manager/community`, because the roles that can act on a report already sign in there.

## Data model

Thirteen collections are declared in `scripts/pocketbase/community-schema.mjs` and spread into `APP_COLLECTION_SCHEMAS`, so the normal startup schema sync creates them: `community_profiles`, `community_posts`, `community_media`, `community_likes`, `community_reposts`, `community_bookmarks`, `community_follows`, `community_blocks`, `community_notifications`, `community_hashtags`, `community_link_previews`, `community_reports` and `community_rate_limits`.

Every one of them has `createRule`, `updateRule` and `deleteRule` set to null, so no browser can write a community record through the standard record API. The hook routes are the only writer. Read rules are open only on `community_profiles` and `community_media`, because PocketBase authorizes a file download against the view rule of the collection that owns the file, and avatars, banners, images and video are served straight from `/api/files/...`.

No relation fields and no `expand` are used anywhere. Author identity is denormalized onto each post and each notification, because the `users` collection restricts list and view to the record owner and a reader could never resolve another account through it. The cost of that choice is that a profile edit has to rewrite its copies; `updateProfile` does so on the 500 most recent posts of that author, and older posts keep the name they were published under.

Post bodies are stored as plain text. `src/lib/comment-formatting.ts` forbids anchors and strips every attribute, so links, hashtags and mentions are persisted as offset ranges in the post's `entities` field and rendered as React nodes. `pb_hooks/lib/community-core.js` and `src/lib/community-text.ts` implement the same scanner twice — once for Goja and once for the browser — and both spell out the Hebrew and Arabic character blocks by hand, because Goja does not support unicode property escapes. `tests/scripts/community-api.mjs` asserts that the offsets the server stores match the offsets the client computes for the same body.

## API surface

`pb_hooks/community.pb.js` registers 28 routes under `/api/community` plus a `communityMaintenance` cron. Reads are anonymous where the screen is public; every write carries `$apis.requireAuth('users')`. Bodies are capped per route: 128 KB for `POST /api/community/posts`, unlimited for the two multipart routes (`PATCH /api/community/me` and `POST /api/community/media`), and 16 KB everywhere else. All routes skip the success activity log so a busy feed does not fill the log table.

- Session and profiles: `GET`/`PATCH /api/community/me`, `GET /api/community/profiles/{handle}` with `/posts`, `/followers` and `/following`, and `POST .../follow` and `.../block`.
- Feed and posts: `GET /api/community/feed`, `GET`/`DELETE /api/community/posts/{id}`, `POST /api/community/posts`, and `POST /api/community/posts/{id}/like`, `/repost` and `/bookmark`, plus `GET /api/community/bookmarks`.
- Media and previews: `POST /api/community/media` and `POST /api/community/link-preview`.
- Notifications: `GET /api/community/notifications` and `POST /api/community/notifications/read`.
- Discovery: `GET /api/community/search`, `GET /api/community/hashtags/{tag}` and `GET /api/community/trends`.
- Reports and moderation: `POST /api/community/reports`, `GET /api/community/moderation/reports`, and `PATCH` on `/moderation/reports/{id}`, `/moderation/posts/{id}` and `/moderation/profiles/{handle}`. The four moderation routes call `ensureModerator`, which refuses a `viewer` and an `author` with 403.

A community profile is created lazily. The first `GET /api/community/me` for an account derives a handle from its name or email address, retries up to twelve times against the unique index, and falls back to `member_` plus ten random characters. That is what turns a newly signed-in account into a participant; nothing else has to be provisioned.

Every list is paged on a keyset cursor of `created|id`, never an offset, and each query asks for one row more than the page size to decide `hasMore`. Page sizes are clamped server-side: the feed defaults to 20 and caps at 50, notifications default to 30. A client asking for 500 rows gets the cap, and a client asking for a negative page gets the default.

Filters bind every value as a `{:param}`. `buildInFilter` exists so that a list of ids becomes `field = {:blk0} || field = {:blk1}` with a params object rather than an interpolated string; the community routes never build a filter out of user input by concatenation.

## Posting, media and previews

The composer uploads each attachment the moment it is picked and the post itself carries only media ids, which is why the post route can live under a 128 KB body limit while a video does not. Images are re-encoded in the browser to fit a 2048 px box at quality 0.82, except GIFs, which are left alone so their animation survives. The server caps a single upload at 10 MB for an image and 100 MB for video and re-derives the kind from the uploaded file rather than trusting the client's `kind` field; `docker/nginx.conf` allows 110 MB so the proxy is never the limit that fires first.

`claimMedia` refuses an attachment that belongs to another account or that is already attached to a post, so a media id cannot be replayed or stolen. Media uploaded but never attached is deleted by the maintenance cron after 24 hours. Deleting a post deletes its media records, and PocketBase removes the underlying files with them.

A link preview is fetched only when the body contains a URL and the post has neither media nor a quoted post, matching what X does with a card. `fetchLinkPreview` refuses private hosts — loopback, the RFC 1918 ranges, link-local, `.local`, `.internal` and any bracketed IPv6 literal — reads at most 512 KB of HTML with an 8 second timeout, and caches the result in `community_link_previews` for seven days keyed by a digest of the normalized URL. A failed fetch is cached as an error and returns no card rather than propagating the failure into the post.

## Threads, engagement and notifications

A reply carries `parentId`, inherits `rootId` from its parent and gets `depth + 1`, clamped at 25. A quote carries `quotedPostId` and is serialized with one level of the quoted post embedded, whose own `quotedPost` is always null so a chain of quotes cannot expand without bound. `clientId` is unique per author, so a retried request returns the original post instead of creating a second one.

Likes, reposts and bookmarks share `toggleJoin`: one transaction inserts or deletes the join row and moves the counter on the post, clamped at zero, so repeated toggling cannot drift. The client applies the change optimistically and then overwrites its guess with the counter the server returned, reverting on failure; a second click on the same post and action is dropped while the first is in flight, because two opposite writes would otherwise race the same unique row.

Notifications cover `like`, `reply`, `repost`, `quote`, `follow` and `mention`. A unique `(userId, actorId, kind, postId)` index collapses an unlike-and-like-again cycle into one row, self-notification is skipped, and unliking or unfollowing withdraws the notification it created. A mention of the account being replied to does not produce a second notification on top of the reply.

Blocking is symmetric: it severs the follow edge in both directions, and both directions are excluded from feeds, threads, hashtags and search through `appendBlockExclusion`. Replying to an account that blocked you is refused.

Deleting a post with replies tombstones it — status `deleted`, body and media cleared, counters zeroed — so the replies below it stay reachable. A childless post is deleted outright along with its media, likes, reposts, bookmarks and notifications. A moderator may delete any post; everyone else may delete only their own. A post removed by a moderator keeps its position but is serialized without its body to everyone except its author and other moderators. Its permalink keeps resolving in both cases — `GET /api/community/posts/:id` returns the tombstone with the reply list intact and only 404s when the record itself is gone — because a thread whose root vanished would strand every reply under it.

## Feeds and discovery

`for-you` re-ranks only the first page of the freshest window by `likeCount + replyCount * 2 + repostCount * 3`, so a quiet feed still leads with what people reacted to while paging stays on the plain cursor. `following` requires a session and reads the caller's 200 most recent follow edges plus their own posts. `latest` is the unmodified reverse-chronological stream. Replies never appear at feed level.

Search switches on a leading `#` to the hashtag index rather than a body scan, and it works for Hebrew tags. People search matches handle or display name and skips suspended accounts. Trends come from `community_hashtags`, whose `recentCount` is halved by the maintenance cron for any tag unused for seven days, so last month's tag stops leading. Account suggestions exclude the accounts the caller already follows.

## Rate limits and maintenance

Per-account hourly limits are enforced in `community_rate_limits`, keyed by action, user and hour bucket: 30 posts, 90 replies, 600 likes, 200 follows, 60 media uploads, 60 link previews, 30 reports and 40 profile edits. `communityMaintenance` runs every ten minutes and prunes rate-limit buckets older than two hours, deletes pending media older than a day and decays hashtag counts. It returns immediately when the community collections do not exist, so it is inert on a deployment that has not synced the schema.

## Runtime and verification

The community needs no new environment variables and no new services. `pnpm pb:sync-app-schema` — which container startup already runs — creates the thirteen collections, and the hooks in `pb_hooks/` ship in the image. Media travels through the existing nginx `/api` proxy, so no separate object store or CDN is involved.

Run the pure unit checks with:

```sh
npm run test:community-core
```

They load `pb_hooks/lib/community-core.js` in a `node:vm` sandbox and exercise the section that touches no PocketBase globals: entity scanning, handle validation and suggestion, URL normalization and the private-host refusal, cursor encoding, page-size clamping, filter building and post validation.

Run the end-to-end checks against a disposable local PocketBase instance with:

```sh
COMMUNITY_TEST_PB_URL=http://127.0.0.1:8090 npm run test:community-api
```

The script refuses any host other than `localhost` or `127.0.0.1`, authenticates as the superuser `community-test@example.com`, creates any missing collection and empties the community tables so counters and pagination are exact. It drives four accounts across the three permission tiers and asserts, through the hook routes only: anonymous reads succeeding while twelve anonymous writes are refused; lazy profile creation with four distinct handles, and rejected handles and websites; server entity offsets matching `src/lib/community-text.ts` for a body mixing a Latin hashtag, a Hebrew hashtag, a mention and a URL; `clientId` returning the first post on a retry; three-level threads with inherited roots and ancestors ordered root-first; like, repost and bookmark counters across a full on-off-on cycle; follows and the following feed; a real PNG uploaded through the media route, with reuse, theft and a missing id all refused; 25 bulk posts driving a keyset walk over 28 rows with no repeats, and `perPage` clamped from 500 to 28 and from -4 to 20; notifications by kind with per-owner read marking and withdrawal on unlike; post, people and hashtag search including a Hebrew round trip and a filter-injection term returning nothing; symmetric blocks severing follows; and the moderation flow refusing a `viewer` and an `author` while a `manager` removes, restores, suspends and resolves.

Type checking is `npx tsc -b`, which `npm run build` runs before Vite.
