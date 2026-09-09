# Scheduled newsletter updates

The Scheduled page has independent newsletter import and publishing sections. Imports create drafts. The existing digest job continues to email published newsletters.

An admin enters an HTTPS repository URL, username, token and interval in hours. The URL includes the repository name and optional folder, such as `https://host/artifactory/generic-local/newsletters`. The server uses Basic authentication with the username and token. The token is omitted from responses, hidden in the schema and held in a collection whose standard record APIs are locked. Temporary worker input files have owner-only permissions and are removed after execution.

The importer uses Artifactory's recursive [File List API](https://docs.jfrog.com/artifactory/reference/getstorageitem). The token needs permission to list and download files. TLS certificates must be trusted by the Node runtime. For an internal CA, configure `NODE_EXTRA_CA_CERTS` with a mounted PEM certificate file. Redirects are rejected to prevent credentials being sent to another endpoint.

## Document structure

The implementation was checked against the three DOCX files in `mems-generic-local-ww/test-news` on 2026-09-09. They contain 3, 3 and 6 articles respectively. Each collection has a cover Title, a collection date, article headings in Heading 1, internal headings in Heading 2, embedded images and Hebrew paragraph properties.

- Each Heading 1 starts an article. Collection front matter before the first article is omitted.
- If a document has multiple Title paragraphs, those are the article boundaries instead.
- A document without those boundaries becomes one article.
- The article heading becomes its title, without repeating it in the body. Embedded PNG, JPEG, GIF and WebP images remain inline; the first image also becomes the cover.
- Paragraph direction and alignment, common text styles, hyperlinks, lists and basic tables are converted into article HTML. Hebrew direction is inferred only when the paragraph has no explicit direction.
- The observed collection markers and redundant image URL lines are omitted. Source publication metadata and image captions remain in the body. Hebrew bylines populate the author field.

This is an article conversion, not a Word page-layout renderer. Floating objects are placed inline. Unsupported or missing image formats fail that file with an actionable error instead of silently losing the image.

## Scheduling and retries

The PocketBase cron checks each minute. A new job is disabled by default and checks daily when enabled. Admins can fetch immediately with the saved settings even while the recurring schedule is disabled.

Each run processes up to three pending files. The saved cursor rotates batches so a failed document cannot block later documents. File downloads are limited to 20 MB, expanded DOCX content to 80 MB, and conversion output to 25 MB per document. Network requests time out after 15 seconds; the subprocess has a two-minute watchdog. The nginx API timeout is three minutes.

A unique checkpoint combines the artifact URL and content checksum. Article creation and its checkpoint commit in one transaction per file. Repeat checks skip imported file versions. A changed file creates new drafts; existing articles and editorial changes are preserved. Successful files remain imported even when another file fails. A database lease prevents overlapping manual and scheduled runs, and expires after five minutes if the process stops unexpectedly.

## Runtime and verification

The normal container startup schema sync creates `newsletter_import_jobs` and `newsletter_imports`. Existing deployments need the updated app image, including hooks, scripts and dependencies. For a standalone PocketBase deployment, run `pnpm pb:sync-app-schema`, install production dependencies and set `APP_ROOT` to the project directory so the hook can locate `scripts/pocketbase/artifactory-import.mjs`. Node must be available on PATH, or through `NODE_BINARY`.

Run the parser and Artifactory client tests with:

```sh
node --test tests/scripts/scheduled-import.test.mjs
```

`tests/scripts/scheduled-import-api.mjs` exercises a disposable local PocketBase instance with the test accounts specified in that script. It expects the three sample collections at the worker's test Artifactory endpoint. The development verification used a local fetch substitute with the original downloaded bytes, without copying production credentials into the test instance. It checked admin authorization, token omission, settings validation, twelve drafts, repeat imports, the run lease, authentication failures and the publishing queue.
