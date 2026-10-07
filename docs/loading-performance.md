# Loading performance

Measured on 2026-10-06 against the production build of commit `0527f25`, using the T3 browser at 1280 × 800 with anonymous sessions and no CPU or bandwidth throttling. The fixture contains 92 newsletters, including 55 published newsletters. Static assets were warm; application data was cleared before each uncached sample.

The final refresh comparison alternated the original and updated frontend against the same updated backend, with gzip enabled for both. The backend retains the original full-record API, so the original frontend still receives its original 28.3 MB list. This comparison holds backend state constant. Earlier measurements also compared separate original and updated backend copies. Samples and timing definitions are saved in [loading-performance-samples.json](loading-performance-samples.json).

## Results

Times start at document navigation or the click handler. Content readiness waits for the relevant populated article element and two animation frames. For document navigation, the reported time is at least first contentful paint. This measures readable content; it does not wait for every image, presentation, comment, or background validation request.

| Scenario | Original samples (ms) | Updated samples (ms) | Median before → after |
| --- | --- | --- | --- |
| Home refresh, application cache empty | 2151, 2195, 1789 | 372, 521, 454 | 2151 → 454 |
| Direct article, application cache empty | 1812, 1745, 1677 | 247, 213, 201 | 1745 → 213 |
| Direct community page, application cache empty | 403, 454, 244 | 181, 188, 189 | 403 → 188 |
| Post click from a loaded feed, +500 ms per API request | 619, 602, 570 | 64, 64, 25 | 602 → 64 |
| Back to that feed, +500 ms per API request | 708, 654, 591 | 71, 72, 47 | 654 → 71 |

Post/Back baseline samples come from the earlier isolated-backend run with the same added delay. Post tests hovered the card for 100 ms before clicking in both builds. The updated feed supplies the cached post immediately while the thread and replies validate in the background. The Back selector excludes the thread card so the measurement cannot accidentally match the previous screen.

After background preparation on home, featured-article clicks with 500 ms added to API requests took 74, 48, and 65 ms; home → community clicks took 50, 32, and 170 ms. These measure the first prepared click as well as repeat clicks. Preparation starts after home has settled and respects Data Saver.

With the same API delay, Projects → Goals changed from 588, 586, and 546 ms before the final project-cache pass to 60, 37, and 33 ms; Goals → Projects changed from 573, 566, and 556 ms to 29, 34, and 32 ms. That earlier checkpoint already had the optimized newsletter loading. Spreadsheet opening took 33 ms and loaded no Excel codecs; Gantt opening took 93 ms. A fresh manager visit still requires its authorized data request; the measured visit with the added delay took 787 ms.

Paint timing varies. A separate pass of the final frontend produced home times of 299, 575, and 490 ms; article times of 304, 157, and 241 ms; community times of 396, 202, and 368 ms. Earlier cached home refreshes with the added delay took 448, 364, and 1284 ms. The slow samples are retained. Previously visited article refreshes with the added delay took 296, 352, and 292 ms while the background article request took over 550 ms. These results demonstrate reduced waits, rather than guaranteeing instantaneous loading on every device or connection.

| Payload | Original | Updated |
| --- | ---: | ---: |
| Initial JavaScript entry, uncompressed | 3,358,736 bytes | 601,364 bytes (82% smaller) |
| Anonymous newsletter listing | 28,333,391 bytes | 426,854 bytes (98.5% smaller) |
| Newsletter data for the measured direct article | Entire 28.3 MB listing | One 346,368-byte article |

The original listing returned its first 50 full records. The new frontend fetches all summary pages, preserving access to the complete published feed and article-body search.

## Changes

- Start route data before React mounts and share pending requests with the mounted screen. Article URLs request their own article instead of the entire feed.
- Request newsletter summaries containing metadata and searchable text. Fetch full content for viewing, editing, comments, and presentations when needed. Serve supported embedded raster covers as versioned binary images; preserve remote and other image formats.
- Use indexed and paginated database reads, native cover decoding, and a bounded five-second server summary cache invalidated by newsletter writes, including scheduled imports.
- Cache reads by backend and account, deduplicate requests, retain feeds for Back navigation, and prepare article and post code/content on pointer or keyboard intent. Mutations and account changes invalidate cached reads.
- Keep public feed summaries in optional session storage for five minutes; keep at most eight public articles in optional IndexedDB for five minutes. Show those while validating against the API and remove articles rejected with 403 or 404. Private newsletter bodies stay in memory.
- Share project reads across Projects, Goals, Gantt, Spreadsheet, and the Gantt editor. Start authorized project reads alongside route loading. Render restored authenticated screens while the session validates; the backend still enforces access. Keep public writers, activity, and newsletter statistics ready for return navigation.
- Defer the authenticated account menu for anonymous visitors, retain its first pending click, and keep heavy feed sections from rerendering on unrelated updates. Prepare the featured article and community feed after home settles, with cancellation and Data Saver support.
- Merge edits, engagement changes, and new replies into pending feed/thread responses so background reads cannot undo an action or omit the rest of the page. Discard cached bodies after denied revalidation. Keep published-newsletter counts correct after publishing and moving between manager tabs.
- Load manager tabs, editors, community dialogs, presentations, and spreadsheet file libraries when needed. The shared deferred component commits when its import resolves. Import and export codecs do not load merely to view the spreadsheet.
- Import icons through their individual public modules, combine shared route icons, self-host the existing fonts, skip offscreen card layout, lazy-load secondary images and controls, and remove animation waits from initial content and header controls.
- Compress production text assets and API responses, cache hashed assets and fonts immutably, and revalidate HTML. Cover responses check access before returning 304; private draft thumbnails fetch with scoped authorization.

## Reproduce

Run the backend locally on port 7090, then:

```sh
npm run build
npm run perf:serve -- dist 4191 0 --gzip
# Separate shell: simulate 500 ms of additional latency on each API request.
npm run perf:serve -- dist 4192 500 --gzip
```

`scripts/performance/serve.mjs` injects `probe.js` only into its benchmark responses. Production HTML does not include instrumentation. `BENCHMARK_BACKEND_PORT` selects a separate backend when comparing a frozen build against an isolated database copy.

In the browser, use `window.__readPerformance()` after `window.__PERF__.readyMs` becomes available. Clear session storage and the `newsletter-public-articles` IndexedDB database before uncached measurements. Keep them for repeat-refresh measurements. Park the pointer over the header logo before measuring page loads to avoid unintended article prefetches. Record multiple samples and their median.

For clicks, install the readiness observer with the action:

```js
// Feed card → thread; the existing feed cannot match this target.
await window.__measureNavigation(
  () => document.querySelector('main article.relative:not(.py-5)').click(),
  'main article.py-5',
);

// Thread → feed; exclude the old thread card.
await window.__measureNavigation(
  () => history.back(),
  'main article.relative:not(.py-5)',
);
```

## Verification and deployment

The updated production preview is running on port 4184, with the API proxied to port 7090. Port 4185 and the temporary benchmark servers were stopped. Assets are served with gzip and no Vite development client. Final browser checks on this preview verified home, direct article refresh, community post opening, and Back navigation.

On 2026-10-07, the earlier UI fixes were restored and verified in [the UI regression audit](ui-regression-audit.md). The current entry, `index-Dr-RYqFp.js`, is 601,538 bytes, 174 bytes above the measured performance build. The timing samples above remain measurements of that earlier performance build.

`npm run build`, 60 regression tests, 45 loading tests, 17 scheduled import tests, community core/mirror checks, changed TypeScript lint, and the Nginx configuration check passed (122 automated regression/loading/import tests in total). Browser checks covered article viewing/editing, draft thumbnails, community composing, profile, all manager tabs, the Gantt editor, desktop dropdowns, and mobile search. Spreadsheet tests round-trip real Excel files with dates, roles, and resources.

The local backend exercised temporary draft creation, updating, deletion, search-index maintenance, and summary invalidation. A comparison of all original columns across the 92 newsletter records found no changes after the derived-field backfill and test cleanup.

Deploy the frontend, hooks, and worker scripts together. On backend startup, `newsletter-read.pb.js` adds the hidden `searchText` field and two read indexes, then fills missing derived text without changing content or timestamps. The existing Docker image uses Node 24 for native SQLite backfill and cover decoding; standalone PocketBase deployments have a slower JavaScript fallback. No new package dependencies are required.
