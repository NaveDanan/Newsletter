# Newsletter on MMEMS

The application is managed by the ArgoCD Application `newsletter` in `argocd`. Its chart reads `helm/newsletter/values.mmems.yaml` from the `gantt-editor` branch. Sync is manual and does not prune retained data.

- Site: http://10.40.240.3:32280
- PocketBase administration: http://10.40.240.3:32290/_/
- Namespace and Deployment: `newsletter`
- Credentials: externally provisioned Secret `newsletter-env`, never Git values
- Data: `newsletter-pb-data`, 5Gi, RWO, `newsletter-longhorn`, Retain

The storage class uses the existing Longhorn driver with two replicas and selects disks tagged `newsletter`. Each node has a local ext4 directory at `/home/longhorn-newsletter`, registered as Longhorn disk `newsletter-local`. Each reserves 80Gi from Longhorn scheduling on the shared root filesystem. These are directories on existing disks; no filesystem formatting is required. Monitor actual root filesystem usage independently of Longhorn's scheduling reservation.

The image is built on the connected workstation and pushed to Artifactory at `artifactory.rafael.co.il/mems-docker-local-ww/danan/newsletter:<tag>` with `jf docker push`. The cluster pulls it from there using the `kubernetes.io/dockerconfigjson` Secret `nave-pull-secret` in the `newsletter` namespace. Artifactory does not allow anonymous pulls. That secret is provisioned outside Git; its JFrog token expires 2027-10-04. Do not import images into the nodes by hand.

Build with the Linux PocketBase distribution configured in `POCKETBASE_DIST_DIR`, then run the API integration tests against a disposable local container. Push the tested image to Artifactory and verify that its tag and digest are there. Then push the source and manifest changes and sync the Application. Keep the application image tag unique for every changed build; never reuse or overwrite a pushed tag.

The initial deployment provisions a fresh database and creates the configured admin accounts. It does not migrate the separate NFS deployment or import workstation data. SMTP and Keycloak SSO require environment-specific configuration and are disabled in this VM profile.

Before any future data migration, use [the migration runbook](../../docs/longhorn-data-migration.md). Do not delete or recreate the PVC during an application update. The StorageClass is a separate cluster resource; it is not owned by the application release.
