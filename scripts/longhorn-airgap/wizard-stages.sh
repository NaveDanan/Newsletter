# This section is appended to the unmodified wizard skill library.
TOTAL_STAGES=10
umask 077
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
state_dir="${LONGHORN_WIZARD_STATE:-$PWD/.longhorn-airgap}"
mkdir -p -- "$state_dir"
chmod 700 "$state_dir"
ENV_FILE="$state_dir/wizard.env"
output_dir="$state_dir/generated"
if [[ ${1:-} == --help ]]; then
  printf 'Run bash wizard.sh on an internal Linux administration workstation.\nRequires Bash, Python 3.9+, kubectl and an existing ArgoCD installation.\nThis is a fresh-install flow; it stops if Longhorn CRDs already exist.\nNo cluster creation, upgrade or data migration is performed.\n'
  exit 0
fi
[[ -t 0 ]] || { echo 'Run interactively in a terminal; do not pipe answers.' >&2; exit 1; }
for tool in python3 kubectl tar sha256sum; do
  command -v "$tool" >/dev/null || { echo "Missing $tool. Install from internal packages before starting." >&2; exit 1; }
done
ask_saved() {
  local key=$1 prompt=$2 fallback=${3:-}
  ask "$key" "$prompt"
  [[ -n "${!key}" ]] || printf -v "$key" '%s' "$fallback"
  [[ -n "${!key}" ]] || { warn "$key is required. Re-run when it is available."; exit 1; }
  write_env "$key" "${!key}"
}
gate() { confirm "$1" || { say "Stopped. Non-secret answers are saved in $ENV_FILE."; exit 0; }; }
fresh() { python3 "$script_dir/offline.py" fresh --config "$ENV_FILE"; }

banner 'Longhorn: fresh air-gapped installation through ArgoCD'

stage 'Review the procedure'
say '1 Review scope. 2 Capture Artifactory/ArgoCD locations. 3 Verify transferred bundle.'
say '4 Select and check the real cluster. 5 Import images and chart to Artifactory.'
say '6 Prepare nodes/CA/network. 7 Generate and review manifests.'
say '8 Configure read credentials. 9 Create the ArgoCD Application and sync manually.'
say '10 Verify installation and test persistence.'
note 'The real cluster has no Longhorn. MMEMS practice already has it; do not target that installation.'
note 'Only non-secret answers are saved to wizard.env. Tokens are entered later and stored in Kubernetes Secrets.'
gate 'Use this stage order for a fresh installation?'

stage 'Capture the internal repository locations'
open_url 'https://artifactory.rafael.co.il/'
step 'Ask the Artifactory administrator for a LOCAL Docker repository and a LOCAL Helm repository.'
step 'In Artifacts, select the Docker repository and open Set Me Up. Copy the push prefix before /longhornio/.'
ask_saved REGISTRY_PREFIX 'Docker push prefix, without https:// (example: artifactory.rafael.co.il/docker-local):'
step 'For Helm, check whether the repository uses OCI or legacy Helm. New Artifactory repositories often default to OCI.'
ask_saved HELM_REPO_MODE 'Helm repository mode [oci or legacy]:' 'oci'
step 'OCI: copy host/repository without oci://. Legacy: copy the HTTPS Helm client URL from Set Me Up.'
ask_saved HELM_REPO_URL 'Helm client repository URL/prefix:'
ask_saved ARGO_NAMESPACE 'Existing ArgoCD namespace [argocd]:' 'argocd'
ask_saved ARGO_PROJECT 'ArgoCD project allowed to install cluster storage resources [default]:' 'default'
ask_saved ARGO_URL 'Internal ArgoCD web URL, including https://:'

stage 'Verify the transferred offline bundle'
step 'Copy and extract the archive through your approved transfer process. Compare its sidecar SHA256 with the connected-side record first.'
ask_saved BUNDLE_DIR 'Absolute path of the extracted longhorn-airgap-1.11.2 directory:' "$script_dir"
[[ -d "$BUNDLE_DIR" ]] || { warn 'Bundle directory does not exist.'; exit 1; }
python3 "$script_dir/offline.py" verify --bundle "$BUNDLE_DIR"
mkdir -p -- "$state_dir/tools"
tar -xzf "$BUNDLE_DIR/tools/helm-linux-amd64.tar.gz" -C "$state_dir/tools" linux-amd64/helm
helm_bin="$state_dir/tools/linux-amd64/helm"
chmod +x "$helm_bin"
"$helm_bin" show chart "$BUNDLE_DIR/longhorn-1.11.2.tgz"
note 'The bundle includes 14 Longhorn/CSI images plus BusyBox for the acceptance test. It does not include Kubernetes or OS packages.'

stage 'Select the real cluster and check that Longhorn is absent'
step 'Use your approved kubeconfig. This terminal must have Kubernetes access; SSH access alone is insufficient.'
kubectl config get-contexts
ask_saved KUBE_CONTEXT 'Exact kubeconfig context for the REAL cluster:'
kubectl --context "$KUBE_CONTEXT" --request-timeout=30s get nodes -o wide
kubectl --context "$KUBE_CONTEXT" --request-timeout=30s get namespace "$ARGO_NAMESPACE"
kubectl --context "$KUBE_CONTEXT" --request-timeout=30s get crd applications.argoproj.io >/dev/null
cluster_uid=$(fresh)
write_env CLUSTER_UID "$cluster_uid"
kube_version=$(kubectl --context "$KUBE_CONTEXT" --request-timeout=30s version -o json | python3 -c 'import json,sys; v=json.load(sys.stdin)["serverVersion"]["gitVersion"].lstrip("v").split("+")[0]; major,minor=map(int,v.split(".")[:2]); assert (major,minor)>=(1,25), "Longhorn requires Kubernetes >=1.25"; print(v)')
write_env KUBE_VERSION "$kube_version"
note "Cluster identity: $cluster_uid"
gate 'Have you verified these are the real cluster nodes, not the existing MMEMS Longhorn installation?'

stage 'Upload all images and the Helm chart'
open_url 'https://artifactory.rafael.co.il/'
step 'On an internal Linux Docker workstation with the extracted bundle, run:'
printf '    bash %q %q %q\n' "$BUNDLE_DIR/import-images.sh" "$BUNDLE_DIR" "$REGISTRY_PREFIX"
say 'The importer asks for a writer token privately, loads local archives, checks image IDs, then pushes every image.'
warn 'Do not upload docker-save .tar files as generic artifacts and expect Docker pulls to work. Images must be loaded and pushed.'
if [[ "$HELM_REPO_MODE" == oci ]]; then
  say 'On that workstation, log in with Helm using --password-stdin and a temporary HELM_REGISTRY_CONFIG, then run:'
  printf '    helm push %q %q\n' "$BUNDLE_DIR/longhorn-1.11.2.tgz" "oci://$HELM_REPO_URL"
else
  step 'Artifactory > Artifacts > Deploy: choose the legacy Helm LOCAL repository, upload longhorn-1.11.2.tgz and deploy it.'
  note 'The upload URL and Helm client URL differ. ArgoCD needs the client URL ending in /artifactory/api/helm/REPOSITORY.'
fi
step 'Confirm the chart version and all 15 image tags exist, using the repository browser.'
gate 'Have the images and pinned chart been uploaded to internal LOCAL repositories?'

stage 'Prepare each node and internal trust'
ask_saved DATA_PATH 'Dedicated local data directory, present on every storage node [/var/lib/longhorn]:' '/var/lib/longhorn'
ask_saved REPLICAS 'Storage replicas [2 for two eligible nodes; 3 for three or more]:' '2'
say 'On EVERY eligible node, use the internal OS package source for iSCSI/NFS clients and run:'
printf '    sudo bash node-check.sh %q\n' "$DATA_PATH"
step 'Provision local disks first. Do not point this directory at NFS or format an existing disk as part of this wizard.'
step 'Install the Artifactory CA in each container runtime and in ArgoCD repository-server trust. Follow the runbook; do not disable TLS verification.'
step 'Keep DNS, NTP, the Kubernetes API, node traffic and Artifactory reachable. Confirm public egress is blocked for nodes and pods.'
note 'K3s registry fallback settings alone are not an egress firewall. Restarting K3s requires a planned node-by-node operation.'
gate 'Have all node checks, disk capacity, CA trust and offline network requirements been verified?'

stage 'Generate and review the ArgoCD deployment'
python3 "$script_dir/offline.py" generate --config "$ENV_FILE" --output "$output_dir"
"$helm_bin" template longhorn "$BUNDLE_DIR/longhorn-1.11.2.tgz" --namespace longhorn-system \
  --kube-version "$kube_version" -f "$output_dir/longhorn-values.json" > "$output_dir/longhorn-rendered.yaml"
python3 "$script_dir/offline.py" audit --config "$ENV_FILE" --manifest "$output_dir/longhorn-rendered.yaml"
say "Review $output_dir/longhorn-application.json and longhorn-rendered.yaml. JSON files are valid Kubernetes/Helm inputs."
note 'ArgoCD owns a separate longhorn Application. Manual sync, no automated pruning, no application deletion finalizer.'
note 'The default StorageClass stays unchanged. Longhorn volumes use Retain. Upgrade checks that call home are disabled.'
note 'Commit the non-secret Application to your internal configuration repository if you use an app-of-apps setup.'
gate 'Is this exact manifest ready for the real cluster?'

stage 'Store read credentials for Kubernetes and ArgoCD'
open_url 'https://artifactory.rafael.co.il/'
step 'Obtain a Docker READ token for nodes and a Helm READ token for ArgoCD from your Artifactory administrator.'
note 'Use reader credentials here, not the writer token used for importing. Credentials are not written into Helm values or Git.'
ask LH_PULL_USER 'Docker reader username:'
ask_secret LH_PULL_TOKEN 'Docker reader token (hidden):'
ask LH_HELM_USER 'Helm reader username:'
ask_secret LH_HELM_TOKEN 'Helm reader token (hidden):'
export LH_PULL_USER LH_PULL_TOKEN LH_HELM_USER LH_HELM_TOKEN
gate 'Create the longhorn-system namespace and the two read-credential Secrets in the selected cluster?'
python3 "$script_dir/offline.py" credentials --config "$ENV_FILE"
unset LH_PULL_USER LH_PULL_TOKEN LH_HELM_USER LH_HELM_TOKEN

stage 'Show Longhorn in ArgoCD and sync'
fresh >/dev/null
gate 'Create the reviewed longhorn ArgoCD Application? This does not sync it automatically.'
python3 "$script_dir/offline.py" application --config "$ENV_FILE" --manifest "$output_dir/longhorn-application.json"
open_url "$ARGO_URL"
step 'In Settings > Repositories, confirm the Artifactory Helm repository connection succeeds.'
step 'Open Applications > longhorn. Check the source points to Artifactory, version 1.11.2, and the destination is longhorn-system.'
step 'Review the resource diff. Click Sync, keep Prune disabled, and synchronize. Wait for Synced and Healthy.'
note 'If chart access fails, check the repository mode, URL, reader token and ArgoCD CA trust. Do not use a public Helm repository as fallback.'
gate 'Has the manual ArgoCD sync completed?'
kubectl --context "$KUBE_CONTEXT" -n "$ARGO_NAMESPACE" get application longhorn \
  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status

stage 'Verify the installation and persistence'
kubectl --context "$KUBE_CONTEXT" -n longhorn-system get pods -o wide
kubectl --context "$KUBE_CONTEXT" get storageclass longhorn
say 'The test creates its own namespace and 1Gi PVC, pulls the test image from Artifactory, and checks data after replacing its pod.'
say 'It keeps test resources for inspection. It does not run a node-failure test or touch Newsletter data.'
gate 'Run the isolated storage acceptance test now?'
bash "$script_dir/verify-storage.sh" "$KUBE_CONTEXT" "$REGISTRY_PREFIX"
say 'Before adding production data, configure and test backups. Longhorn replication is not a backup.'
say 'Newsletter can then use its existing values.longhorn.yaml profile with ReadWriteOnce.'
finish
