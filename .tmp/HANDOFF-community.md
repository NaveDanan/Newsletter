# Handoff: community network (X-like) on /community

Written 2026-09-10. Work stopped at the user's request mid-verification.
Nothing is running: no background agents, no monitors, no cron jobs, no
containers, no scratch credentials on the cluster.

## State: shipped and live

- Branch `gantt-editor`, pushed. HEAD = `fb1492d`, identical to `origin/gantt-editor`.
  - `ee74791` the feature itself (routes, hooks, collections, UI).
  - `bf6e846` client/server mirror fixes + `npm run test:community-mirror`.
  - `fb1492d` release 1.0.24 and the MMEMS image tag.
- ArgoCD app `newsletter`: **Synced at fb1492d, Healthy**. Synced by patching a
  sync operation onto the Application; the app has no automated sync policy.
- Image `newsletter:1.0.24-20260910.1` built on `MMEMS-real01` from a clean
  clone, `docker save`d and imported into the k3s containerd `k8s.io` namespace
  on **both** nodes (real01 and real02). Tags must stay unique per build because
  `pullPolicy: IfNotPresent` reads local images, not a registry.
- Pod `newsletter-bd9b8fb49-mq7rk` Running 1/1 on mmems-real01. Startup logs show
  all 13 `community_*` collections created against the retained PVC.
- http://10.40.240.3:32280/ 200, /community 200, /api/community/feed 200.

## Verified on the deployed instance

- Full API suite (`tests/scripts/community-api.mjs`, 416 lines) against a
  disposable container built from the same image: exit 0.
- `test:community-core` and `test:community-mirror` pass inside the build clone.
- Live smoke against the cluster (since deleted): profile auto-creation, a post
  whose stored body was byte-identical to `normalizeCommunityBody`, matching
  entity offsets, like toggling to `likeCount: 1` **through the API**, reply
  threading, idempotent `clientId` retry, hashtag timeline, search, notifications.
- Route gates on the live host: anonymous POST to posts/media/reports → 401;
  anonymous GET of feed/search/hashtags/trends → 200; me/notifications/moderation → 401.
- Browser, Hebrew RTL, signed in as a throwaway account: composer posted, the
  character counter read 4954 remaining for a 46-char body (so it counts the
  trimmed string), the post rendered with a live hashtag chip and link, and deep
  links worked for /community/latest, /search/posts/<hebrew>, /u/admin,
  /u/admin/followers and /u/admin/following — the connections heading now reads
  "העוקבים של @admin", which is the i18n bug fixed in bf6e846.

## OPEN — the one thing I did not finish

**A like clicked in the browser did not persist.** After clicking the post's
`aria-label="לייק"` button, `aria-pressed` stayed `false` and
`community_likes` had **0 rows** (checked before any cleanup). The same toggle
works through the API (`{active: true, likeCount: 1}`), so the hook is fine and
this is a client-side or click-targeting problem. It is equally possible my
Playwright locator (`article >> nth=0 >> button[aria-label="לייק"]`) never
landed the click. **Reproduce before assuming a bug.** Note the action row
exposes `aria-pressed` on "שיתוף", "לייק" and "שמירה" — worth confirming those
labels map to repost/like/bookmark as intended.

Media upload, video, link-preview unfurling (needs egress from the pod to the
target site), reposts, quotes, bookmarks, notifications-in-UI and the moderation
queue were **not** exercised through the browser. Only the API suite covers them.

## Not done

- The phased plan document. `docs/plans/` holds only three unrelated HTML files,
  so format and placement were never settled. `docs/community.md` (105 lines) is
  the current documentation and is accurate.
- No PR opened. `gantt-editor` is both the working branch and the PR/main branch
  for this repo, and ArgoCD tracks it directly.
- Six gantt files remain deliberately unstaged and untouched: `src/index.css`,
  `src/lib/gantt.ts`, `src/locales/messages.ts`,
  `src/sections/manager/GanttEditorPage.tsx`, `src/sections/manager/GanttView.tsx`,
  `src/types/gantt.ts`. They are somebody else's in-flight work.

## Environment notes worth keeping

- Docker Desktop is **not** running on the Windows workstation; the image was
  built on real01. `~/newsletter-build` there is a clean clone with node_modules
  installed — reusable, or delete it to reclaim ~2 GB.
- `sudo` on real01 needs the password piped (`echo <pw> | sudo -S -p ""`).
  real01 now has an ssh key authorized on real02 (`agent@real01`), added to move
  the image tarball; remove it if that is unwanted.
- PocketBase hooks do not hot-reload; every hook edit needs a restart.
- `pb_hooks/` is Goja ES5 — no unicode property escapes, no `let`/`const` habits.
- `pb_hooks/lib/community-core.js` is the authority; `src/lib/community-text.ts`
  mirrors it. Change one, change both, and `npm run test:community-mirror` will
  fail loudly if they disagree.
