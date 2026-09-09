# PocketBase storage and upgrade assessment

Verified on 2026-09-07 against the official PocketBase GitHub release APIs, release notes, security advisories, SQLite documentation, and the npm registry. Live publication dates agree with the environment date. This is a research assessment, not a record of an upgrade or deployment.

## Recommendation

Move the live database off NFS, establish a verified dataset on suitable storage, then test PocketBase 0.40.3 and SDK 0.28.1 before deployment. An upgrade does not repair existing corruption. The newer releases provide worthwhile auth, availability and backup fixes, but no supported NFS database-storage solution was found.

The user reports corruption errors despite backup, redeployment and SQL repair, with most application functions still working but Keycloak SSO failing. No exact error, damaged database or target-cluster logs were available for this assessment. The cause of that incident has not been reproduced or confirmed. The storage recommendation follows upstream requirements independently of that diagnosis.

## NFS and cluster storage

PocketBase 0.40.3 still opens SQLite with `journal_mode(WAL)` in its [default connection code](https://github.com/pocketbase/pocketbase/blob/v0.40.3/core/db_connect.go). Its [FAQ](https://pocketbase.io/faq/) still identifies SQLite WAL as its database and says other databases are not supported out of the box. Switching to PostgreSQL is therefore not a configuration change.

SQLite documents that WAL is unsuitable for network filesystems and requires processes accessing the database to share host-local coordination. Its broader [network-filesystem guidance](https://sqlite.org/useovernet.html) also warns about locking and synchronization behavior. One PocketBase replica reduces conflicting access but does not certify NFS semantics. A longer busy timeout addresses waiting for locks, not filesystem correctness. Disabling WAL is not a supported drop-in solution for this prebuilt executable, which sets WAL when it connects. [SQLite WAL documentation](https://sqlite.org/wal.html).

Repository observations:

- `helm/newsletter/values.yaml` already defaults to one replica, `Recreate`, `ReadWriteOnce`, and `/pb_data` persistence.
- `helm/newsletter/templates/pvc.yaml` omits `storageClassName` when `persistence.storageClass` is empty, allowing the cluster default to choose the storage.
- `docker/entrypoint.sh` runs superuser upsert before starting the server, followed by schema and settings synchronization. Starting a test container against the only data copy would therefore not be a read-only inspection.
- The only configured local Kubernetes context is `clearml-k3s`. Read-only queries found `local-path`, `longhorn`, and `longhorn-static` storage classes. Its Deployment and PVC listings contained no Newsletter installation, so this cannot establish the failing deployment's storage or binary version.

For a cluster with healthy Longhorn installed, use a filesystem volume backed by Longhorn block storage and requested as `ReadWriteOnce`. Keep one PocketBase pod and `Recreate`. Generic Longhorn `ReadWriteMany` volumes are exposed through NFS and would reintroduce the same storage type. [Longhorn architecture](https://longhorn.io/docs/1.11.2/what-is-longhorn/), [Longhorn RWX documentation](https://longhorn.io/docs/1.12.1/nodes-and-volumes/volumes/rwx-volumes/).

If the target cluster only provides NFS, it needs a suitable block-storage provisioner, or a local persistent volume with an accepted node-failure recovery plan. Local storage ties availability to its node; replicated block storage can support volume recovery on another node but does not make PocketBase multi-writer or guarantee uninterrupted service. RWO limits mounting to one node, not necessarily one pod. [Kubernetes volume access modes and local volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).

Example values for a newly provisioned Longhorn claim, subject to target-cluster verification:

```yaml
replicaCount: 1
deploymentStrategy:
  type: Recreate
persistence:
  enabled: true
  existingClaim: ""
  storageClass: longhorn
  accessModes:
    - ReadWriteOnce
  size: 10Gi
  mountPath: /pb_data
```

Changing values does not move data from an existing bound NFS PVC. Provision a separate destination claim, copy or restore into it during a planned write outage, then point `persistence.existingClaim` to that new claim. Preserve the original claim and backup for recovery. Coordinate the cutover with ArgoCD if it manages the Deployment.

## Existing corruption and recovery

Restoring a damaged backup can reproduce the same failure. Copying database files while writes are active can also produce an inconsistent backup, especially if the database and WAL are separated. Partial application success does not prove that all tables and indexes are intact. These are possible explanations, not findings about the supplied dataset. [SQLite corruption causes](https://sqlite.org/howtocorrupt.html).

Recommended sequence for the target environment:

1. Capture the exact corruption error, failed SSO response, image digest and `/opt/pocketbase/pocketbase --version`. Identify the PVC, actual PV backend and mount type. Keep credentials, auth codes and tokens out of captured logs.
2. Arrange a write outage and preserve the entire stopped `pb_data` directory, including any remaining WAL files. Keep an untouched copy. PocketBase's documented manual backup procedure requires the application to be stopped. Built-in backups are another supported option, but a successful backup is not proof of healthy source data. [PocketBase backup guidance](https://pocketbase.io/docs/going-to-production/#backup-and-restore).
3. On a writable disposable copy on local or block-backed storage, run `PRAGMA integrity_check;` and separately `PRAGMA foreign_key_check;` against both `data.db` and `auxiliary.db` when present. Integrity should report `ok`; foreign-key checking should return no rows. Use a current SQLite tool. The CLI version is separate from the SQLite version embedded in PocketBase. [SQLite PRAGMA reference](https://sqlite.org/pragma.html).
4. Prefer a known-good backup. If none exists, use SQLite recovery only on copies and import into a separate database. Recovery can lose records, alter values or recover deleted material; validate schema, indexes, auth links and application records before accepting the result. Do not assume a SQL repair command restored semantic correctness. [SQLite recovery limitations](https://sqlite.org/recovery.html).
5. First validate the recovered data with the current server on the new storage. Then stage the 0.40.3 upgrade on a separate copy. Disable outgoing mail and scheduled side effects in staging. Validate backup restoration and keep the pre-upgrade data with its original image for rollback; do not assume swapping an older binary onto migrated data is a rollback.

NFS can remain a destination for completed backup archives. S3-compatible storage can hold PocketBase uploads and backups, but it does not move the embedded database out of `pb_data`. [PocketBase filesystem abstraction](https://pocketbase.io/docs/js-filesystem/).

## Keycloak SSO check

The SSO failure remains unconfirmed. The frontend uses generic provider `oidc`, retrieves auth methods, and performs a manual authorization-code exchange. `src/lib/pocketbase/client.ts` returns `${window.location.origin}/sso-callback`, and `src/contexts/AuthContext.tsx` uses that URI both when redirecting and when exchanging the code. This differs from the `/api/oauth2-redirect` URI described in `docs/oidc-login.md` and `docs/kubernetes.md`.

Check the deployed frontend's actual callback against Keycloak's valid redirect URIs, then inspect PocketBase's server-side exchange error and Keycloak event. Also verify provider endpoints, client secret, PKCE and provider name. The UI hardcodes `oidc`; configuring another provider name in Helm would require matching the frontend. Startup also rewrites the provider from environment values, including `extra: {}`, so a dashboard-only provider adjustment can be overwritten. These are code observations and investigation targets, not a diagnosis of the outage.

Test both an existing linked Keycloak user and a new user after recovery and again after upgrading. Newer OAuth account-linking safeguards are relevant, but do not promise to fix an unidentified current SSO error.

## Versions and repository baseline

| Component | Repository evidence | Latest non-prerelease verified |
| --- | --- | --- |
| PocketBase server | `docs/kubernetes.md` uses a `pocketbase_0.36.9_linux_amd64` build context. `Dockerfile` copies the executable from external `pocketbase-dist`; the source tree does not prove the version of an existing image or running server. | [v0.40.3](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.3), published 2026-09-06 17:33:10 UTC. |
| JavaScript SDK | `package.json` requests `^0.26.8`; both `pnpm-lock.yaml` and `package-lock.json` resolve 0.26.8. The Docker build uses the frozen pnpm lockfile. | [v0.28.1](https://github.com/pocketbase/js-sdk/releases/tag/v0.28.1), published 2026-09-05 09:38:13 UTC; [npm latest metadata](https://registry.npmjs.org/pocketbase/latest) also returns 0.28.1. |

The server and SDK have separate version numbers. Updating the npm package does not replace the server binary. The `^0.26.8` range does not admit 0.27.x or 0.28.x. The authoritative latest endpoints checked were the [server API](https://api.github.com/repos/pocketbase/pocketbase/releases/latest) and [SDK API](https://api.github.com/repos/pocketbase/js-sdk/releases/latest), both with `prerelease: false`.

## Database and security findings

The documented server baseline already contains the SQLite WAL-reset fix. PocketBase [v0.36.7](https://github.com/pocketbase/pocketbase/releases/tag/v0.36.7) upgraded to SQLite 3.51.3 on 2026-03-16, and [v0.36.9](https://github.com/pocketbase/pocketbase/releases/tag/v0.36.9) followed on 2026-04-09. SQLite identifies the affected range as 3.7.0 through 3.51.2, with a fix in 3.51.3 and later. The bug involves concurrent writes/checkpoints from multiple connections with unusual timing. It is a specific corruption race; its fix does not establish that a filesystem is suitable for WAL. [SQLite WAL-reset explanation](https://sqlite.org/wal.html#walresetbug).

Upgrading beyond 0.36.9 still has substantial security value:

| Release | Relevant change | Application implication |
| --- | --- | --- |
| [0.37.4](https://github.com/pocketbase/pocketbase/releases/tag/v0.37.4), 2026-04-27 | Fixes OAuth2 account pre-hijacking through unverified-to-verified account linking. | The 0.36.9 baseline falls within the affected range. Exploitability depends on configured providers and account state. The fix clears previous OAuth links on the affected verification upgrade. See [CVE-2026-44166 advisory](https://github.com/pocketbase/pocketbase/security/advisories/GHSA-pq7p-mc74-g65w). |
| [0.37.4](https://github.com/pocketbase/pocketbase/releases/tag/v0.37.4) and [0.37.5](https://github.com/pocketbase/pocketbase/releases/tag/v0.37.5) | Reduces password-auth timing enumeration and email-change enumeration; corrects password change detection. | Include password login, reset and email verification in upgrade validation. |
| [0.38.1](https://github.com/pocketbase/pocketbase/releases/tag/v0.38.1), 2026-05-15 | Invalidates existing realtime auth state after password or collection secret changes. | Test connected clients if realtime is introduced or used outside the inspected frontend. |
| [0.38.2](https://github.com/pocketbase/pocketbase/releases/tag/v0.38.2), 2026-05-22 | Adds realtime IP checks and a default 30-minute absolute connection limit, plus dependency security updates. | Reconnection and proxy client-IP configuration matter for realtime clients. The current SSO flow uses a full-page code exchange rather than the all-in-one realtime OAuth helper. |
| [0.39.7](https://github.com/pocketbase/pocketbase/releases/tag/v0.39.7), 2026-07-16 | Recovers panics in internal worker goroutines that could terminate the server. Also switches validation dependency to PocketBase's maintained fork. | The documented baseline predates the fix. The [CVE-2026-82410 advisory](https://github.com/pocketbase/pocketbase/security/advisories/GHSA-84vh-m24q-wjjx) rates the availability issue high, 8.7. |

The 0.36.9 baseline also already includes SMTP password-clear persistence and OAuth avatar URL probing protections. Those are not new benefits of 0.40.3. [0.36.9 notes](https://github.com/pocketbase/pocketbase/releases/tag/v0.36.9).

## Changes that affect an upgrade

- [0.37.0](https://github.com/pocketbase/pocketbase/releases/tag/v0.37.0) rewrites the admin UI, adds dark mode, collection field help, view previews and JSON export. `listAuthMethods()` gains inline SVG provider logos. Existing dashboard logo paths remain temporarily available but are deprecated. The inspected app uses its own sign-in UI, so its screenshots and admin instructions are more affected than its React layout.
- [0.38.0](https://github.com/pocketbase/pocketbase/releases/tag/v0.38.0) adds superuser IP/CIDR allowlists and rate-limit exclusions. It also adds a filesystem watcher to synchronize runtime state between PocketBase processes using the same `pb_data`. This feature alone is not evidence of network-filesystem support.
- [0.38.1](https://github.com/pocketbase/pocketbase/releases/tag/v0.38.1) includes a system migration that resaves collections with indexes, incorporating manually created indexes into collection metadata. Compare schema/index exports after a staging upgrade and retain the pre-upgrade backup for rollback.
- [0.39.0](https://github.com/pocketbase/pocketbase/releases/tag/v0.39.0) adds a superuser SQL console, automated backup failure emails, `oidc2`/`oidc3` option-field fixes and updated default email text.
- [0.39.1](https://github.com/pocketbase/pocketbase/releases/tag/v0.39.1) adds panic recovery for cron jobs. [0.39.8](https://github.com/pocketbase/pocketbase/releases/tag/v0.39.8) resets overwritten JSVM `$app` state between pooled executions. Both are relevant to the scheduler and hooks in `pb_hooks/main.pb.js`.
- [0.39.4](https://github.com/pocketbase/pocketbase/releases/tag/v0.39.4) relaxes PocketBase's required redirect-URL check for OAuth code exchange; providers can still require the original matching redirect URI. Keep the current callback URI unchanged.
- [0.39.6](https://github.com/pocketbase/pocketbase/releases/tag/v0.39.6) adds Microsoft-provider email extraction options and Cc/Bcc support to the development sendmail command. The repo defaults to the generic `oidc` provider pointed at Entra endpoints. Microsoft-specific options do not automatically apply to this configuration. See the [maintainer's Microsoft-provider explanation](https://github.com/pocketbase/pocketbase/discussions/7756).

### The 0.40 release line

[0.40.0](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.0), published 2026-08-23, has two explicit compatibility concerns: CLI errors now propagate as nonzero exit codes, and the move to Go 1.27 / `encoding/json/v2` is not fully backward compatible. Test startup scripts and real JSON records, API responses and settings updates before production use.

Other changes in that release include default `Cross-Origin-Opener-Policy: same-origin`, quoted download filenames, `Record.GetInt64`, `Store.Keys`, a log truncation endpoint, default log-data/message size limits, filesystem writer hooks, backups that avoid a transaction lock during generation, and SQLite defensive mode via `modernc.org/sqlite` 1.57.0. The log limits can alter diagnostics, and the header warrants checking browser auth flows. [0.40.0 notes](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.0).

The subsequent patches matter enough to avoid targeting the initial 0.40.0 release:

| Release | Corrections |
| --- | --- |
| [0.40.1](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.1), 2026-08-24 | Fixes invalid UTF-8 JSON serialization and OAuth2 provider configuration merging that replaced the whole provider list. The latter directly relates to `scripts/sync-pocketbase-oidc-settings.mjs`. |
| [0.40.2](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.2), 2026-09-02 | Makes filter serialization failures return errors and performs substitution in one pass; fixes unnamed index parsing; updates goja regex/base64 behavior and builds with Go 1.27.1 database/sql and JSON fixes. |
| [0.40.3](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.3), 2026-09-06 | Fixes JSON response status writing, JSON-field compatibility with duplicate legacy keys, partial index expressions, nested self-relation cascade deletes, geodistance rounding and excess request-body reads. Changes the JSVM `$app` TypeScript declaration to an interface and updates `golang.org/x/*` dependencies. |

The inspected code uses JS hooks and the prebuilt executable, so Go source-interface/build changes do not by themselves require an application rewrite. That is an assessment from the repository structure, not a completed compatibility test.

## SDK changes since 0.26.8

| Release | Change |
| --- | --- |
| [0.26.9](https://github.com/pocketbase/js-sdk/releases/tag/v0.26.9) | Improves async realtime subscribe/unsubscribe handling. |
| [0.27.0](https://github.com/pocketbase/js-sdk/releases/tag/v0.27.0) | Adds SQL console and collection metadata API handlers for newer servers. |
| [0.27.1](https://github.com/pocketbase/js-sdk/releases/tag/v0.27.1) | Fixes realtime initial connection races and subscription resubmission. |
| [0.27.2](https://github.com/pocketbase/js-sdk/releases/tag/v0.27.2) and [0.27.3](https://github.com/pocketbase/js-sdk/releases/tag/v0.27.3) | Corrects `pb.filter()` handling of custom JSON conversion, arrays, objects and undefined values. |
| [0.28.0](https://github.com/pocketbase/js-sdk/releases/tag/v0.28.0) | Adds `pb.logs.truncate()` for server 0.40.0+. |
| [0.28.1](https://github.com/pocketbase/js-sdk/releases/tag/v0.28.1) | Makes `pb.filter()` substitution a single pass to fix regex chaining. |

These release notes announce additions and fixes, with no explicit breaking SDK change in the reviewed interval. The current repo's full-page SSO uses `listAuthMethods()` and `authWithOAuth2Code()`, not `authWithOAuth2()`. The inspected frontend does not call the new SQL/log APIs or `pb.filter()`. SDK 0.28.1 is a sensible companion upgrade, but server security fixes come from replacing the server binary.

## Validation specific to this application

The proposed server target is 0.40.3 with SDK 0.28.1, subject to a staging run against a copy of the current data. Validate migrations and indexes; startup collection, mail and OIDC synchronization; password login/reset/verification; existing and new SSO users; custom API permissions and JSON responses; newsletter uploads and downloads; subscription/unsubscription; scheduled digests; and a backup/restore cycle. Test mail with a controlled recipient or SMTP test sink.

`pb_hooks/main.pb.js` registers mail hooks, API routes and the minute scheduler. `pb_hooks/lib/newsletter-mail.js` normally uses `app.newMailClient()`, with a separate Node SMTP path when insecure development TLS is enabled. Test the path used by the target environment. The 0.40 JSON changes and 0.38.1 index migration justify these checks even though no release note requires renaming the hooks used here.

No dependency, server binary, configuration, data or deployment was changed during this research. The server baseline remains inferred from build documentation until the deployed executable and image are inspected.
