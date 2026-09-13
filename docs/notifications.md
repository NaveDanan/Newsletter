# Notifications

The shared inbox lives at `/community/notifications`. Signed-in users see an unread badge in the header and community navigation. Profile settings at `/profile#notification-preferences` save automatically.

Users can enable or disable mentions, comments and replies, followed-user posts, event reminders, newsletters, and other community activity. The master switch pauses all delivery without resetting those choices. Existing inbox history remains available.

Browser pop-ups require the user to enable each browser and accept its permission prompt. Background delivery is selected by default. Turning off “Notify while the site is closed” switches to pop-ups delivered by the open site's poller. Both modes respect the same global and type preferences. Signing out unregisters that browser's subscription and clears its notification ownership. A service worker also checks ownership before displaying or opening a notification.

## Delivery behavior

- Community mentions include newly added tags on edits. Self-notifications and notifications across blocked relationships are suppressed. A post creates at most one notification per recipient, with mentions taking priority over replies, thread activity, and followed-user activity.
- Comments notify previous participants in a community thread or newsletter article. Editing or liking a newsletter comment does not send another comment alert.
- Top-level posts and quotes notify followers. Replies do not create followed-user alerts.
- Publishing a newsletter sends one alert to accounts that existed at publication time. Draft saves, edits, and republication do not repeat it.
- Event reminders use current newsletter RSVPs and run every minute during the 30 minutes before the start. Repeated ticks are deduplicated. Rescheduling produces a new reminder; canceled RSVPs and past events are skipped. Newly saved event dates use UTC instants. Legacy dates without an offset retain their original server-local interpretation until saved again.
- Browser notifications open their post, profile, or newsletter. Clicking one marks it read after the app authenticates the user. The browser and operating system control permission, display style, and background delivery availability.

## Server operation

`notification_jobs` persists content delivery in the same transaction as post/newsletter writes. A transaction rolls back both. Notifications and their push jobs commit together. Immediate processing handles ordinary traffic; the minute scheduler resumes pending work. Newsletter fan-out uses batches of 100 accounts. The unique event indexes prevent duplicate inbox entries on retries.

Web Push jobs send in batches of 50, outside database transactions. A two-minute lease allows recovery after an interrupted worker. Failed requests retry with exponential delays, up to six attempts. Expired subscriptions are removed after HTTP 404 or 410. Preferences and subscription ownership are checked again before sending. The notification tag prevents duplicate visible pop-ups during a retry.

The Node worker uses `web-push` to encrypt payloads and sign requests. Endpoint validation accepts only HTTPS endpoints belonging to the supported browser push providers. Payload files have owner-only permissions and are removed after processing. Keys and endpoint tokens are excluded from worker logs.

VAPID signing keys are generated once, on the first request to enable background notifications, and stored in the locked `notification_push_config` collection. Back up this collection with the PocketBase database. The client receives only the public key. `WEB_PUSH_SUBJECT` may override the contact URI; otherwise the configured PocketBase sender email is used.

The existing Docker build includes the worker and dependency. Startup schema synchronization creates the new locked collections. For a separately managed PocketBase installation, deploy `pb_hooks`, run `npm run pb:sync-app-schema`, install Node dependencies, and restart PocketBase. Set `APP_ROOT` to this repository's directory and optionally `NODE_BINARY` to the Node executable. Serve the frontend over HTTPS, except for localhost development. On iOS/iPadOS, browser push requires a supported Home Screen web app.

These controls manage in-app and browser alerts. The existing newsletter email subscription system remains separate.

## Verification

`npm run test:notifications` starts a disposable PocketBase instance and tests preferences, isolation, content triggers, event timing, rollback, deduplication, pagination, more than 500 read updates, both browser modes, private subscription storage, retry behavior, and expired subscriptions. Set `NOTIFICATION_TEST_PB_BINARY` to a PocketBase executable; the local default is `.tmp/community-pb/pocketbase.exe`. `NOTIFICATION_TEST_PORT` defaults to 7092. Test endpoints are copied only into the disposable instance.

`npm run test:browser-notifications` checks encrypted payload construction, transport behavior, endpoint restrictions, service-worker mode and ownership checks, safe destinations, and event timezone conversion. Push transport is simulated in automated tests; it never contacts a real user's browser.

The implementation follows the [PocketBase transaction hook semantics](https://pocketbase.io/docs/js-event-hooks/), the [Web Push library API](https://github.com/web-push-libs/web-push), and the [browser Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).
