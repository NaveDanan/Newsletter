# Deploy Newsletter with Longhorn

For an offline cluster using Artifactory and ArgoCD, follow the [air-gapped wizard](longhorn-airgap.md). The commands below assume access to the public Helm repository.

The existing Newsletter image works with Longhorn. Kubernetes mounts the volume at `/pb_data`; PocketBase needs no additional package inside the image. Longhorn runs as a separate cluster service, installed once and shared by applications. Keep its Helm release separate from Newsletter so removing the app does not remove cluster storage.

## Prepare the cluster once

Select the target Kubernetes context explicitly. The `clearml-k3s` context inspected on 2026-09-07 already had Longhorn installed; the failing Newsletter deployment was not present there.

```bash
kubectl --context YOUR_CONTEXT get storageclass longhorn
kubectl --context YOUR_CONTEXT -n longhorn-system get pods
```

If Longhorn already exists, reuse it and follow the app steps below. Do not reinstall or upgrade it as part of an app deployment.

For a new installation, first meet the [node requirements](https://longhorn.io/docs/1.12.1/deploy/install/#installation-requirements), including host iSCSI support, mount propagation and supported local disks. Use local ext4/XFS storage for Longhorn replicas. Putting the Longhorn data directory on the same NFS share would defeat this change. Check the target cluster with the matching `longhornctl check preflight` before installation.

The following uses the pinned [Longhorn 1.12.1 Helm chart](https://longhorn.io/docs/1.12.1/deploy/install/install-with-helm/) for a new installation. It keeps the current cluster default storage class and requests three storage replicas. Provide enough eligible nodes and disk space for those replicas. A one-node test installation can use one replica, with no protection against loss of that node.

```bash
helm repo add longhorn https://charts.longhorn.io
helm repo update longhorn
helm install longhorn longhorn/longhorn \
  --kube-context YOUR_CONTEXT \
  --namespace longhorn-system --create-namespace \
  --version 1.12.1 \
  --set persistence.defaultClass=false \
  --set persistence.defaultClassReplicaCount=3 \
  --set defaultSettings.defaultReplicaCount=3 \
  --wait --timeout 10m
```

Confirm the Longhorn nodes and disks are schedulable before deploying Newsletter. Storage replicas are copies managed by Longhorn; the app still runs one PocketBase pod. This setup does not require public access to the Longhorn dashboard.

## Deploy a new Newsletter instance

Prepare your environment values with the image registry/tag, credentials, ingress and mail/SSO settings. Add the supplied storage profile last:

```bash
helm upgrade --install newsletter ./helm/newsletter \
  --kube-context YOUR_CONTEXT \
  --namespace newsletter --create-namespace \
  -f YOUR_ENVIRONMENT_VALUES.yaml \
  -f ./helm/newsletter/values.longhorn.yaml \
  --wait --timeout 10m
```

For a new claim, leave `persistence.existingClaim` empty in your environment values. This profile selects `longhorn`, `ReadWriteOnce`, 20Gi, one app replica and `Recreate`. Override size if needed. Longhorn must provision a filesystem volume backed by block storage. Do not use generic `ReadWriteMany`, which Longhorn exposes through [NFS](https://longhorn.io/docs/1.12.1/nodes-and-volumes/volumes/rwx-volumes/).

For ArgoCD, merge this into the existing Application's `spec.source.helm`:

```yaml
valueFiles:
  - values.longhorn.yaml
```

Keep your existing environment value files before this entry. `valuesObject` and Helm parameters take precedence over value files, so remove or update conflicting persistence, replica and strategy overrides. If Longhorn is also managed through ArgoCD, install it as its own Application and wait until its driver and storage class are ready before syncing Newsletter.

## Move an existing NFS deployment

Follow the [detailed data migration runbook](longhorn-data-migration.md) for the stopped backup, integrity checks, ArgoCD retention controls, cutover and rollback procedure.

The profile does not convert a bound PVC or copy data. Setting `existingClaim` also bypasses PVC creation, so `storageClass: longhorn` cannot change the backend of that claim.

1. Schedule a write outage and coordinate it with ArgoCD reconciliation. Preserve the stopped `pb_data` directory and a separate untouched backup.
2. Provision a new Longhorn RWO PVC in the Newsletter namespace with a different name, for example `newsletter-pb-data-longhorn`.
3. Restore a verified dataset into the new volume. Keep PocketBase stopped during file copying. Existing corruption must be resolved on copies before accepting the restored data; see the [recovery assessment](pocketbase-release-research.md#existing-corruption-and-recovery).
4. Set `persistence.existingClaim: newsletter-pb-data-longhorn` in the environment values and apply the Longhorn profile. Retain the original PVC/PV and backup independently of the app release. If the original PVC was chart-managed, arrange retention before syncing the switch; Helm or ArgoCD can otherwise delete the resource when it disappears from the rendered chart.
5. Verify records, uploads, login, Keycloak SSO, restart persistence and backup restoration. Move to a newer PocketBase version only after the recovered dataset works on the new storage.

## Verify the deployed storage

```bash
kubectl --context YOUR_CONTEXT -n newsletter get pvc
kubectl --context YOUR_CONTEXT -n newsletter rollout status deployment/newsletter
kubectl --context YOUR_CONTEXT -n newsletter exec deployment/newsletter -- sh -c 'cat /proc/mounts | grep " /pb_data "'
```

Adjust the deployment name if using `fullnameOverride` or another release name. The PVC should be Bound, use `longhorn` and RWO, and `/pb_data` should be a local filesystem mount such as ext4, not `nfs` or `nfs4`. Inspect the bound PV's CSI driver when confirming the backend. A successful rollout does not prove the restored database is healthy.
