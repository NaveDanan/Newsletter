# Migrate Newsletter data from NFS to Longhorn

This procedure requires an application write outage. It preserves the old volume and an independent backup, verifies a stopped copy, then switches the existing application to a new PVC. Installation of Longhorn alone does not migrate data or repair corruption.

The real cluster has not been inspected from this workspace. Resolve the target context, namespace, Deployment, ArgoCD Application, source PVC, data path and internal utility image before executing changes. Do not use the MMEMS practice cluster as a substitute.

## 1. Collect the current configuration

Run these read-only commands inside the real environment. Replace the uppercase placeholders. Share only the resulting resource names and storage information, not Secrets or kubeconfig contents.

```bash
kubectl config current-context
kubectl --context REAL_CONTEXT -n APP_NAMESPACE get deployments,pods,pvc -o wide
kubectl --context REAL_CONTEXT get storageclass longhorn -o yaml
kubectl --context REAL_CONTEXT -n APP_NAMESPACE get deployment APP_DEPLOYMENT \
  -o jsonpath='{range .spec.template.spec.volumes[*]}{.name}{" -> "}{.persistentVolumeClaim.claimName}{"\n"}{end}'
kubectl --context REAL_CONTEXT -n APP_NAMESPACE get deployment APP_DEPLOYMENT \
  -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{" "}{.image}{"\n"}{range .volumeMounts[*]}{.name}{" -> "}{.mountPath}{" subPath="}{.subPath}{"\n"}{end}{end}'
```

Also record the running image digest, current PocketBase version, application revision, existing Secret references, security context, node constraints and actual used bytes. Keep a private export of the current deployment and GitOps configuration. Application YAML or Helm values can contain credentials; do not paste those exports into chat.

Verify Longhorn has healthy schedulable nodes, local ext4/XFS disks and sufficient space for the requested replicas. The target PVC must be filesystem mode, ReadWriteOnce, using a PV with CSI driver `driver.longhorn.io`. Do not select RWX for PocketBase.

Check whether uploads use local storage or external S3 storage. A `pb_data` copy does not back up an external bucket. Preserve its configuration and credentials and arrange a separate backup if used.

## 2. Protect the old data and control reconciliation

In the authoritative application configuration, turn off automated sync, self-healing and pruning for the migration. Coordinate parent Applications, ApplicationSets, autoscalers and other controllers so they cannot undo the maintenance state. Disabling auto-sync on a generated child alone may be reverted.

While the old PVC is still rendered by the chart, merge these entries with any existing persistence annotations and sync that protection first:

```yaml
persistence:
  annotations:
    argocd.argoproj.io/sync-options: Prune=false,Delete=false
    helm.sh/resource-policy: keep
```

If the PVC is managed elsewhere, apply equivalent protection through its actual owner. Verify the annotations on the live PVC. Retain the old PVC as an explicitly managed resource throughout the migration and retention period. Merge existing ArgoCD sync options rather than discarding them.

Set and verify the old PV's reclaim policy as `Retain`. This is a second safeguard; it does not prevent deletion of the PVC itself. Preserve the source NFS directory through the storage administrator's retention process too. Do not delete the PVC or PV, change its storage class, or run a Helm uninstall.

## 3. Prepare tools and an empty destination

Create a separately named Longhorn PVC in the same namespace, for example `newsletter-pb-data-longhorn`. Size it above the measured data size with working headroom. Manage this claim independently so switching `persistence.existingClaim` cannot remove it. Protect its PVC and PV with retention too.

Before the outage, prepare an internal Artifactory image with a shell, copy/archive tools, SHA-256 hashing and a compatible SQLite CLI. Verify its tools and pull credentials. The current repository Dockerfile includes SQLite and Node, but that does not prove the deployed image has them. The BusyBox image from the installation bundle alone cannot perform SQLite integrity checks.

Prepare a temporary utility Pod manifest that overrides the image entrypoint to an idle shell. It must never start PocketBase or run application bootstrap. Mount the old PVC read-only at `/source` and the new one read-write at `/target`. Respect source subpaths, UID/GID, permissions and cluster Pod security requirements. Use the internal registry and a pull Secret available in the application namespace.

Prepare an independent backup destination outside both PVCs with enough space. Do not rely on Longhorn replicas or a snapshot on the same storage as the sole backup. Review the manifests and commands before applying them.

## 4. Stop all writers

Block user traffic and API writes for the maintenance window. Set the application's desired replica count to zero in the controlled GitOps configuration and apply it. Suspend any Jobs, CronJobs or other processes that write to the same data.

Wait for all application Pods to terminate normally. Check for every consumer of the claim and for processes outside Kubernetes that share the NFS directory. A zero replica count by itself does not prove the files are idle. Avoid force deletion.

Keep the application stopped through backup, copying and database validation. The copied data represents this shutdown point.

## 5. Preserve and copy the complete stopped dataset

Start the reviewed utility Pod only after writers are stopped. Confirm the mounted source is the expected data directory and the destination contains no prior dataset. An ext4 volume may contain `lost+found`; do not mistake that for application data.

Create a complete archive of the stopped source, including hidden files, uploads, database files and any accompanying `-wal`, `-shm` or `-journal` files. Preserve numeric ownership, permissions and links. Store the archive on the independent backup destination, calculate its SHA-256, verify it after transfer and test extracting it to separate scratch storage. Keep the archive untouched.

Copy the same complete dataset to the new volume, preserving metadata. Copy the contents of the data directory into the volume root so the deployed path is `/pb_data/data.db`, not `/pb_data/pb_data/data.db`.

Compare complete relative file inventories, file sizes, content hashes, link targets and required permissions between source and destination. Include hidden files such as `.newsletter-pocketbase-initialized`. Investigate any difference before opening SQLite. Hash comparison proves copy fidelity, not database health.

Do not remove journal files to resolve an error. SQLite needs matching journals to recover interrupted transactions. Do not run SQL repair, checkpointing or recovery against the only source copy.

## 6. Validate databases on the new storage

Keep PocketBase stopped. Open only the working copy on Longhorn with a compatible SQLite tool. Opening a stopped database may replay a journal or checkpoint its WAL, so finish the byte comparison and preserve the independent archive first.

For each active database, including `data.db` and `auxiliary.db` when present, run:

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

Require exactly `ok` from the integrity check. Investigate every foreign-key result; an empty result means none were found by that check. Validate application tables, expected record counts and recent records, and sample uploaded file contents. Missing extensions or custom collations can also cause validation errors; do not treat an unexecutable check as a passing check.

If corruption is reported, stop the cutover. Preserve the copied dataset and untouched archive. Assess a known-good backup or attempt SQLite recovery on another disposable copy, then reconcile recovered records and uploads. Recovery can lose data; it cannot justify a promise of zero loss. Never overwrite the original with recovered output.

## 7. Switch the claim while the app remains stopped

Merge this into the existing environment values, keeping all current credentials, URLs, image digest and other settings:

```yaml
replicaCount: 0
deploymentStrategy:
  type: Recreate
persistence:
  enabled: true
  existingClaim: newsletter-pb-data-longhorn
  mountPath: /pb_data
env:
  pocketbaseRecreateCollections: false
```

Use the actual new PVC name and confirmed data mount path. Check higher-precedence Helm parameters, inline values and `extraEnv` for conflicting overrides. `existingClaim` selects the already created PVC; setting a storage class cannot convert the original claim.

Review the rendered ArgoCD diff. It must keep replicas at zero, reference the new PVC, retain the original data resources, and preserve the application image and configuration. Sync manually with pruning disabled. Do not upgrade PocketBase, change the application revision's code or run the repository's API data-migration script as part of this storage cutover.

Terminate the utility Pod normally and wait for its Longhorn mount to detach before starting the application.

## 8. Validate privately, then reopen traffic

Set replicas to one and sync manually. Keep user traffic blocked. The application entrypoint runs bootstrap and configuration synchronization, so startup itself may modify the target data even before users connect. Verify the copied initialization marker and keep collection recreation disabled.

Confirm the running Pod mounts the new claim and its bound PV uses `driver.longhorn.io`. Inspect the filesystem mounted at the data path and the Longhorn volume health and replica placement. A healthy Pod or HTTP health endpoint is insufficient evidence of healthy data.

Check expected records, recent changes, attachments, local login, Keycloak SSO and relevant application permissions. Keep scheduled email and other outbound jobs controlled during testing to avoid duplicate sends. Test a controlled Pod restart and confirm the same records and files remain. Create a fresh independent backup and validate a restore in isolated scratch storage without external side effects.

If SSO was already broken on NFS, record that baseline. A storage migration may leave an independent OIDC configuration issue unresolved; it does not establish that issue's cause.

Only reopen writes after the acceptance checks pass. Record the cutover time. Restore reconciliation through the authoritative GitOps owner with PVC retention still in place.

## Rollback and retention

Before users resume writes, rollback can use the frozen original dataset if it remains usable. Stop the target app, preserve its current state, switch the claim back under controlled reconciliation and start a single Pod. Returning to NFS also returns to the original storage risk. A corrupted source is not a healthy rollback target.

After writes resume on Longhorn, the NFS copy is stale. Switching directly back would lose those new writes. Stop writes again, preserve the latest Longhorn dataset and plan a verified forward restore or reconciliation. Never start both copies as writable production instances.

Keep the original claim, retained PV, source directory and independent archive for the agreed retention period. Remove migration resources and old storage only in a separately reviewed cleanup after restore testing and operational acceptance.

## References

- [SQLite backup and journal consistency](https://www.sqlite.org/howtocorrupt.html#_backup_or_restore_while_a_transaction_is_active)
- [SQLite integrity and foreign-key checks](https://www.sqlite.org/pragma.html#pragma_integrity_check)
- [ArgoCD resource pruning and deletion controls](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/)
