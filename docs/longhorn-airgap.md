# Longhorn through Artifactory and ArgoCD, without public internet

This procedure installs Longhorn into an existing Kubernetes cluster that does **not** already have Longhorn. Kubernetes and ArgoCD must already work inside the disconnected network. It does not create a cluster, upgrade an existing Longhorn installation, prepare or format disks, or migrate Newsletter data.

The real cluster has no Longhorn, according to the user. The MMEMS practice cluster is separate: on 2026-09-07, `MMEMS-real01` and `MMEMS-real02` already ran Longhorn 1.11.2 with six healthy volumes. No rehearsal or deployment was performed. Do not remove that installation to test this guide.

The package pins **Longhorn 1.11.2**, Linux **amd64**, and Helm CLI **3.21.4**. The Longhorn pin matches the known practice version; it is not a claim that 1.11.2 is the newest release. Review your organization's supported version and the upstream known issues before production use. A different Longhorn version needs a matching chart, image list and regenerated bundle, not just an edited Application version.

## What goes where

| Component | Location and purpose |
| --- | --- |
| Connected preparation workstation | Downloads upstream artifacts once, saves Linux amd64 images and records SHA256 checksums and image IDs. |
| Approved transfer channel | Carries the archive and its separately recorded checksum into the disconnected environment. |
| Artifactory Docker local repository | Holds 14 Longhorn/CSI images and one BusyBox test image, imported with Docker load/tag/push. |
| Artifactory Helm local repository | Holds the pinned chart. OCI and legacy Helm modes are supported. |
| Internal administration workstation | Runs the interactive wizard with Bash, Python 3.9+, kubectl and the transferred Helm binary. |
| Existing ArgoCD | Pulls the chart from Artifactory and manages a separate `longhorn` Application with manual sync. |
| Kubernetes nodes | Pull images from Artifactory and store Longhorn replicas on local ext4/XFS disks. |

ArgoCD is useful here because the cluster already uses it. Keep Longhorn separate from the Newsletter Application. The generated Application has no automated sync/pruning and no deletion finalizer. Its `preUpgradeChecker.jobEnabled` is false as recommended for ArgoCD. Installing it through ArgoCD does not replace host prerequisite work. [Longhorn ArgoCD installation](https://longhorn.io/docs/1.11.2/deploy/install/install-with-argocd/).

The generator sets both `global.imageRegistry` and `privateRegistry.registryUrl`. Testing the actual packaged chart showed that setting only the latter left its image references on Docker Hub. The wizard audits the rendered chart before creating any Application.

## 1. Prepare the archive on the connected Windows workstation

From the project directory, with Docker Desktop running Linux amd64 containers:

```powershell
.\scripts\longhorn-airgap\prepare-bundle.ps1
```

The script writes these ignored output artifacts:

```text
outputs/longhorn-airgap-1.11.2.tar.gz
outputs/longhorn-airgap-1.11.2.tar.gz.sha256
outputs/longhorn-airgap-1.11.2/
  longhorn-1.11.2.tgz
  longhorn-images.txt
  all-images.txt
  bundle.json
  SHA256SUMS
  images/*.tar
  tools/helm-linux-amd64.tar.gz
  tools/longhornctl
  wizard.sh
  offline.py
  import-images.sh
  node-check.sh
  verify-storage.sh
  README.md
```

`bundle.json` records the downloaded image IDs, registry digests and platform. `SHA256SUMS` covers the transferred files. The separate archive hash detects transfer damage; compare it with the recorded connected-side value through your approved process. A checksum bundled with a file is not an independent signature of its provenance.

The complete upstream image list includes the engine, manager, instance manager, share manager, backing-image manager, UI, CLI, support-bundle kit and CSI components. This is broader than the initially rendered Deployment images because Longhorn creates components dynamically. [Official air-gap workflow and image list](https://longhorn.io/docs/1.11.2/deploy/install/airgap/).

The archive does **not** contain Kubernetes, ArgoCD, OS packages or your internal CA. Supply those from existing internal services or approved OS-specific offline packages. `-SkipImages` creates an incomplete planning archive; the installation wizard deliberately rejects it.

## 2. Transfer and verify

On the internal Linux administration/Docker workstation:

```bash
sha256sum -c longhorn-airgap-1.11.2.tar.gz.sha256
tar -xzf longhorn-airgap-1.11.2.tar.gz
cd longhorn-airgap-1.11.2
sha256sum -c SHA256SUMS
chmod +x wizard.sh import-images.sh node-check.sh verify-storage.sh tools/longhornctl
```

Keep the bundle untouched. The wizard writes answers and generated manifests under `.longhorn-airgap/` in its current working directory. It stores only non-secret configuration in `wizard.env`; it never sources that file as shell code. Do not record the terminal session when entering credentials.

Run the interactive wizard after reading the repository and prerequisite sections below:

```bash
bash ./wizard.sh
```

You can stop before any stage and rerun it. Completed external actions are not undone. After Longhorn is installed, the fresh-install check stops a rerun; use `verify-storage.sh` separately for acceptance testing. The wizard is intended for a Linux administration workstation, not PowerShell directly.

## 3. Prepare Artifactory repositories

Open [the internal Artifactory](https://artifactory.rafael.co.il/). Ask an administrator for a Docker **local** repository and a Helm **local** repository. Remote pull-through repositories must not depend on fetching missing artifacts from the internet. An internal virtual repository is acceptable only if all referenced content is already present in its local members.

In Artifactory, select the repository under Artifacts and use **Set Me Up** to get its client endpoints. Names below are examples; no repository names were supplied or created during preparation. [Artifactory client setup](https://docs.jfrog.com/artifactory/docs/use-artifactory-set-me-up-for-configuring-package-manager-clients).

| Value | Example | Meaning |
| --- | --- | --- |
| Docker prefix | `artifactory.rafael.co.il/docker-local` | Destination prefix before `/longhornio/IMAGE:TAG`. Subdomain/port routing can produce a different prefix. |
| Docker login host | `artifactory.rafael.co.il` | Host and optional port, without the repository path. The importer derives it. |
| OCI Helm source | `artifactory.rafael.co.il/helmoci-local` | ArgoCD's Helm OCI repository URL, without `oci://`. |
| Legacy Helm source | `https://artifactory.rafael.co.il/artifactory/api/helm/helm-local` | Helm index endpoint, not the upload endpoint. |

### Import the images

On an internal Linux workstation with Docker and registry CA trust:

```bash
bash ./import-images.sh "$PWD" artifactory.rafael.co.il/docker-local
```

The importer requests writer credentials privately. It uses a temporary Docker credential directory and removes that directory on exit. No public pull is performed: it loads each local archive, verifies its image ID, tags it and pushes it. Reruns repeat pushes to the same pinned tags. Keep the repository paths exactly as generated:

```text
artifactory.rafael.co.il/docker-local/longhornio/longhorn-manager:v1.11.2
artifactory.rafael.co.il/docker-local/longhornio/csi-attacher:v4.11.0-20260428
artifactory.rafael.co.il/docker-local/library/busybox:1.37.0
```

Uploading a Docker-save tar into a generic repository does not publish a pullable container image. The import workstation needs Docker push access; the cluster only needs read access. [Artifactory Docker repositories](https://docs.jfrog.com/artifactory/docs/docker-repositories).

### Upload the chart

Choose one repository mode and use it consistently. Newer Artifactory installations commonly offer Helm OCI by default. [JFrog Helm repository modes](https://docs.jfrog.com/artifactory/docs/kubernetes-helm-chart-repositories).

For **OCI**, extract the supplied Helm CLI or use an approved internal Helm CLI, then use a temporary credential file:

```bash
tar -xzf tools/helm-linux-amd64.tar.gz linux-amd64/helm
chmod +x linux-amd64/helm
umask 077
helm_auth_dir=$(mktemp -d)
export HELM_REGISTRY_CONFIG="$helm_auth_dir/config.json"
read -r -p 'Helm writer username: ' helm_writer
read -r -s -p 'Helm writer token: ' helm_token; printf '\n'
printf '%s' "$helm_token" | ./linux-amd64/helm registry login artifactory.rafael.co.il \
  --username "$helm_writer" --password-stdin
unset helm_token
./linux-amd64/helm push longhorn-1.11.2.tgz oci://artifactory.rafael.co.il/helmoci-local
./linux-amd64/helm pull oci://artifactory.rafael.co.il/helmoci-local/longhorn \
  --version 1.11.2 --destination "$helm_auth_dir"
cmp longhorn-1.11.2.tgz "$helm_auth_dir/longhorn-1.11.2.tgz"
rm -rf -- "$helm_auth_dir"
unset HELM_REGISTRY_CONFIG
```

Run cleanup even if a command fails. Replace the hostname/repository with the actual Set Me Up values. For **legacy Helm**, use Artifactory > Artifacts > Deploy to upload `longhorn-1.11.2.tgz` into the local Helm repository. Confirm its index lists version 1.11.2 and its chart URL stays inside Artifactory.

## 4. Prepare nodes, trust and network

Run the read-only check on every prospective storage node after provisioning its disk:

```bash
sudo bash node-check.sh /var/lib/longhorn
```

For the V1 engine used here, host iSCSI support and a running `iscsid` service are needed. Use local ext4/XFS storage and allow mount propagation and the required privileged Longhorn workloads. Resolve multipath conflicts, taints and capacity limits before deployment. Ubuntu packages include `open-iscsi` and `nfs-common`; install through your internal APT mirror. Other distributions require their equivalent packages. If using transferred package files, gather the complete dependency closure for the exact target OS release and architecture, and test it on an offline matching machine. [Longhorn node requirements](https://longhorn.io/docs/1.11.2/deploy/install/#installation-requirements).

The local check is a useful subset, not a replacement for all upstream prerequisites. It does not install packages, create a data directory or format disks. The optional bundled `longhornctl` can perform additional checks, but its container image and any helper images must be configured for Artifactory before use. Do not run its default public-image command in the disconnected cluster.

Choose three replicas for three or more eligible storage nodes, or two for two eligible nodes. A one-node test uses one replica and has no node-loss redundancy. Capacity must cover replicated data, snapshots, rebuild space and Longhorn's reserved/free-space thresholds. The practice VM's `/var` was already heavily used; it should not be treated as spare rehearsal storage.

### Internal CA trust

There are distinct clients to configure:

- The import workstation's Docker daemon trusts the registry CA using its OS/Docker-specific trust configuration.
- Each Kubernetes node's container runtime trusts the registry CA.
- ArgoCD repository-server trusts the Helm endpoint CA, normally through `argocd-tls-certs-cm` or the managed equivalent in your ArgoCD installation. The key is the endpoint hostname; preserve existing entries. [ArgoCD private repositories and TLS certificates](https://argo-cd.readthedocs.io/en/stable/user-guide/private-repositories/).

The wizard generates a **fragment** for K3s, `k3s-registries.fragment.json`. JSON is valid YAML. When a private CA is needed, merge the fragment into the existing `/etc/rancher/k3s/registries.yaml`, install the verified PEM CA at `/etc/rancher/k3s/artifactory-ca.crt`, and preserve all existing mirrors, authentication and TLS settings. Do not overwrite the existing file with just the fragment. With a publicly trusted CA, its custom `ca_file` entry is unnecessary.

K3s reads this node configuration at startup. Restart `k3s` or `k3s-agent` one node at a time in an approved maintenance window, and verify each node becomes Ready before proceeding. The wizard does not restart services. Standard containerd, RKE2 and other distributions use their own configuration paths. [K3s private registry configuration](https://docs.k3s.io/installation/private-registry).

### Make the offline test meaningful

The generated Longhorn values and test pod use `Always` image pull policy so the runtime contacts Artifactory even when layers are cached. Rendered-image checks catch public references, but they do not prove the network is isolated.

Use the actual disconnected network boundary. If simulating it later, the network owner must block public egress for the relevant **nodes and pods**, while retaining internal DNS, NTP, API-server, node-to-node and Artifactory access. Longhorn and image pulls involve host networking, so an ordinary namespace NetworkPolicy is insufficient. Do not block all traffic on the shared MMEMS cluster to rehearse this.

K3s's `disable-default-registry-endpoint` option only controls fallback for configured mirrors; it is not a global firewall. Preserve any existing pause/sandbox image configuration: Kubernetes base images and OS packages must also already be available internally. Record firewall enforcement or denied public-egress evidence alongside the acceptance result before calling a rehearsal fully air-gapped.

## 5. Values captured by the wizard

| Stage | Values or result | Origin and destination |
| --- | --- | --- |
| 1 Scope | Agreed stage order | User review only. |
| 2 Repositories | `REGISTRY_PREFIX`, `HELM_REPO_MODE`, `HELM_REPO_URL` | Artifactory Set Me Up, saved in `wizard.env` and non-secret generated manifests. |
| 2 ArgoCD | `ARGO_NAMESPACE`, `ARGO_PROJECT`, `ARGO_URL` | Existing cluster configuration and internal ArgoCD URL, saved in `wizard.env`. |
| 3 Bundle | `BUNDLE_DIR`, verified checksum result | Transferred archive path, saved in `wizard.env`. |
| 4 Cluster | `KUBE_CONTEXT`, `CLUSTER_UID`, `KUBE_VERSION` | Approved kubeconfig and read-only API discovery, saved in `wizard.env`. No kubeconfig content is copied. |
| 5 Import | Images and chart published | Writer credentials stay in the separate import session; no CI secret is created. |
| 6 Nodes | `DATA_PATH`, `REPLICAS`, completed prerequisites | Storage design and node checks, saved in `wizard.env` and generated values. |
| 7 Review | Values, Application, local render, optional K3s fragment | `.longhorn-airgap/generated/`; no cluster writes. |
| 8 Credentials | Docker and Helm reader usernames/tokens | User/admin supplied; tokens use hidden entry, ephemeral environment and stdin to Kubernetes. Stored only in the intended Kubernetes Secrets. |
| 9 ArgoCD | `longhorn` Application and manual sync | Application in the chosen ArgoCD namespace; destination `longhorn-system` in the same cluster. |
| 10 Acceptance | Image source, storage driver, mount type and persistence result | Unique test namespace/PVC retained for inspection. |

The runbook assumes ArgoCD is installed on the target cluster. If your ArgoCD centrally manages a different cluster, the Application belongs on the management cluster and its destination must name the registered target. Use your platform team's existing central-cluster flow rather than this same-cluster credential helper unchanged.

## 6. What you will see in ArgoCD

The wizard creates `longhorn-application.json`, then lets you review it before applying. Its source is your Artifactory Helm repository, chart `longhorn`, exact revision `1.11.2`. In ArgoCD, open Applications > longhorn. It should initially show OutOfSync; inspect its resource tree and diff, then Sync with Prune disabled.

The repository includes [an annotated Application example](argocd-longhorn-airgap.example.yaml). Its repository placeholders must be replaced before use; the wizard generates the equivalent manifest from your answers.

Use an AppProject that permits the Artifactory source, the target namespace and Longhorn's cluster-scoped CRDs, RBAC and storage resources. The wizard does not broaden project permissions. If policy blocks a resource, have the platform owner approve the required scope.

Longhorn's dashboard remains a separate UI; ArgoCD shows deployment and sync state. For local dashboard inspection after installation, use an internal port-forward rather than adding an unauthenticated public ingress:

```bash
kubectl --context REAL_CONTEXT -n longhorn-system port-forward service/longhorn-frontend 8081:80
```

Open `http://127.0.0.1:8081`. Check every Longhorn node/disk is schedulable and the test volume is healthy. Do not add automated application deletion/pruning or remove Longhorn CRDs as a troubleshooting shortcut.

## 7. Acceptance and recovery

Run the opt-in test independently after installation if you stopped the wizard earlier:

```bash
bash verify-storage.sh REAL_CONTEXT artifactory.rafael.co.il/docker-local
```

It checks Longhorn pod image references, creates a unique `longhorn-airgap-test-*` namespace with a 1Gi RWO claim, writes a marker, replaces the pod, and verifies the marker and ext4/XFS mount. The bound PV must use `driver.longhorn.io`. It prints the volume health and the first/second pod nodes. Pod recreation is not a node-failure or backup-restore test.

Review the retained test namespace and PV, then remove only those identified test resources when finished. The generated storage class uses Retain, so deleting the test namespace does not automatically delete its retained PV/Longhorn volume. Cleanup of that exact test volume is a separate deliberate step.

Before production data, configure backups to an internal S3 or NFS backup destination and test restoring a separate volume. Longhorn replicas protect against some disk/node failures; they also replicate accidental deletion and application-level corruption. For PocketBase, migrate a verified dataset and use the existing Newsletter `values.longhorn.yaml` profile with RWO. Keep storage installation and damaged-database recovery as separate operations.

| Failure | Check first |
| --- | --- |
| Fresh-install check stops | Verify context. Existing Longhorn CRDs can indicate a running or incomplete installation. Do not delete them blindly. |
| ArgoCD repository connection fails | OCI versus legacy mode, client URL, reader permissions, repository-server CA trust and internal chart URL. |
| ImagePullBackOff | Exact registry prefix, retained `longhornio/` path, tag presence, pull Secret and CA trust on the scheduled node. |
| Pod admission rejected | Required privileged/system workloads and the AppProject/namespace security policy. |
| PVC Pending or degraded volume | Eligible nodes, requested replicas, free/reserved disk space, disks marked schedulable and taints. |
| Attach/mount failure | Node iSCSI service/modules, runtime mount propagation and multipath configuration. |
| Upgrade notification/network attempt | Confirm upgrade checker is disabled and inspect node/container runtime fallback configuration. |

Never repair a failed first sync by removing existing production storage resources. Keep manual sync, fix the reported prerequisite or registry problem, and retry. This guide intentionally provides no automated Longhorn uninstall or forced volume deletion.
