# Notification previews and final UI verification

Verified on 2026-10-07 using the production build on port 4184 and the T3 collaborative browser. The initial JavaScript entry is `index-C3JwtlQr.js`, 602,854 bytes uncompressed. The notification popover and preview list are deferred until interaction with a notification control.

## Resulting behavior

- The newsletter delete and send-email buttons have centered icons in 44 × 44 pixel targets. They stay together when the other controls wrap on narrow screens.
- Profile and Manager use the same header component, retaining home, language, account, management, and sign-out controls. Editor navigation continues through the existing unsaved-change guard.
- Account-menu, mobile-bell, and community notification controls open a preview containing the six newest notification groups. “See more” opens the existing paginated notification page.
- Activity on the same post or article is grouped, with distinct participants represented by profile photos. The stack uses three 36-pixel circular photos, 12-pixel overlap, white separator rings, and a gray circle for additional participants, matching the supplied reference. Both LTR and RTL stacks follow the page direction. Newsletter notifications show a 48-pixel cover thumbnail, with the existing logo as a fallback.
- Opening the preview shows available account-scoped cached data immediately and revalidates. Read actions update the displayed group's unread members; stale reads cannot undo that update. Account changes and denied access discard private cached content.

## Bounded API reads

The authenticated preview query selects the latest six conversations, with at most 30 recent notifications from each conversation (180 records total). A busy post cannot crowd the other five conversations out of the dropdown. Participant photos, the additional-participant badge, activity counts, and grouped read actions reflect these recent members; older notifications remain available on the full notification page.

Profile metadata and published-newsletter covers use bounded queries. Article bodies and embedded image data are not returned in the preview payload. Cover URLs use the existing access-checked binary endpoint. The ordinary paginated notification page also receives profile photos and cover metadata.

## Browser checks

- At RTL widths 320, 390, 768, 1280, and 1600, the first three newsletter rows had no horizontal overflow. Each delete/email pair shared the same vertical position, and every measured icon's horizontal and vertical offset from its button center was zero.
- Profile had the shared header at 320 and 1280 pixels without horizontal overflow. Its home control returned to the home route.
- The desktop account-menu preview showed six groups without leaving Manager. Newsletter thumbnails loaded, keyboard ArrowDown selected the first item, and Escape dismissed the menu.
- The mobile preview fit a 320 × 800 viewport. Its “See more” action opened `/community/notifications` and dismissed the preview.
- The desktop community rail opened six groups inside the viewport while keeping the community feed route, including after closing and reopening. The popover height follows Radix's available viewport height, keeping its footer visible while the list scrolls. This also passed at 390 × 500. A fresh home navigation made no notification-preview API request before interaction.
- With a synthetic, browser-only response containing eleven distinct participants, English/LTR at 390 × 844 and Hebrew/RTL at 320 × 800 displayed three overlapping photos and a `+8` badge, with white separator rings and readable dark-mode text. This response tested geometry without writing notification data to the shared backend. The isolated API tests separately verified real actor records and current profile metadata.
- On a dirty Gantt editor at 320 × 800, “See more” closed the preview before opening the unsaved-change dialog. The dialog fit the viewport; cancel preserved the local edits and route, while “Leave without saving” opened notification history. No schedule save was made during this check.

[Raw final action geometry and RTL avatar observations](notification-preview-audit.json) accompany these checks. The earlier full UI restoration audit and its 124 checks are retained separately in [ui-regression-audit.md](ui-regression-audit.md).

## Automated checks

The final production build and changed TypeScript lint passed. The final automated suites passed 72 regression tests, 45 loading tests, and 17 scheduled-import tests (134 total). A trigger regression checks that reopening does not invoke the original page link and that the first click survives the deferred import.

The isolated notification API suite verified six-group ordering, a busy thread with 70 events, the 30-member bound, distinct participants, refreshed profile photos, payload size below 30 KB, recipient isolation, read updates, and published-only cover metadata. Existing notification preferences, delivery, comments, pagination, and bulk-read checks also passed. The isolated scheduled-import auto-publish integration suite passed. Both integration suites use disposable databases.
