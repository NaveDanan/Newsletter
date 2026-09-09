#!/usr/bin/env bash
# Explicit opt-in acceptance test. Creates a unique namespace and 1Gi PVC.
set -euo pipefail
umask 077
context=${1:?Usage: verify-storage.sh KUBE_CONTEXT ARTIFACTORY_DOCKER_PREFIX}
prefix=${2:?Missing Artifactory Docker prefix}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
python3 - "$prefix" "$script_dir" <<'PY'
import sys
sys.path.insert(0, sys.argv[2])
from offline import registry_prefix
registry_prefix(sys.argv[1])
PY
prefix=${prefix%/}
k=(kubectl --context "$context" --request-timeout=30s)
namespace="longhorn-airgap-test-$(date +%s)-$RANDOM"
marker="persist-$RANDOM-$RANDOM"
printf 'Creating acceptance test in %s on context %s\n' "$namespace" "$context"
"${k[@]}" get csidriver driver.longhorn.io >/dev/null
"${k[@]}" get pods -n longhorn-system -o json | python3 -c '
import json, sys
prefix = sys.argv[1] + "/"
pods = json.load(sys.stdin)["items"]
images = [c["image"] for p in pods for c in p["spec"].get("containers", []) + p["spec"].get("initContainers", [])]
if not images or any(not i.startswith(prefix) for i in images):
    raise SystemExit("Longhorn pods are missing or still reference images outside Artifactory")
print("All running Longhorn pod specifications reference Artifactory")
' "$prefix"
"${k[@]}" create namespace "$namespace"
# Copy only this known image-pull secret, over pipes, without logging its data.
"${k[@]}" get secret longhorn-artifactory-pull -n longhorn-system -o json |
  python3 -c 'import json,sys; s=json.load(sys.stdin); s["metadata"]={"name":"longhorn-artifactory-pull","namespace":sys.argv[1]}; s.pop("status",None); print(json.dumps(s))' "$namespace" |
  "${k[@]}" create -f -
python3 - "$namespace" <<'PY' | "${k[@]}" create -f -
import json, sys
print(json.dumps({"apiVersion":"v1","kind":"PersistentVolumeClaim","metadata":{"name":"persistence-check","namespace":sys.argv[1]},
 "spec":{"storageClassName":"longhorn","accessModes":["ReadWriteOnce"],"resources":{"requests":{"storage":"1Gi"}}}}))
PY
make_pod() {
  python3 - "$namespace" "$prefix/library/busybox:1.37.0" <<'PY' | "${k[@]}" create -f -
import json, sys
print(json.dumps({"apiVersion":"v1","kind":"Pod","metadata":{"name":"persistence-check","namespace":sys.argv[1]},
"spec":{"restartPolicy":"Never","terminationGracePeriodSeconds":5,"imagePullSecrets":[{"name":"longhorn-artifactory-pull"}],
"containers":[{"name":"check","image":sys.argv[2],"imagePullPolicy":"Always","command":["sh","-c","sleep 3600"],
"volumeMounts":[{"name":"data","mountPath":"/data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"persistence-check"}}]}}))
PY
  "${k[@]}" wait -n "$namespace" --for=condition=Ready pod/persistence-check --timeout=300s
}
make_pod
"${k[@]}" exec -n "$namespace" persistence-check -- sh -c 'printf "%s" "$1" > /data/marker; sync' sh "$marker"
first_node=$("${k[@]}" get pod -n "$namespace" persistence-check -o jsonpath='{.spec.nodeName}')
"${k[@]}" delete pod -n "$namespace" persistence-check --wait=true --timeout=120s
make_pod
actual=$("${k[@]}" exec -n "$namespace" persistence-check -- cat /data/marker)
[[ "$actual" == "$marker" ]] || { echo 'FAIL: marker did not survive pod replacement.' >&2; exit 1; }
"${k[@]}" exec -n "$namespace" persistence-check -- awk '$2=="/data" { print; if ($3!="ext4" && $3!="xfs") exit 1; found=1 } END { if (!found) exit 1 }' /proc/mounts
volume=$("${k[@]}" get pvc -n "$namespace" persistence-check -o jsonpath='{.spec.volumeName}')
driver=$("${k[@]}" get pv "$volume" -o jsonpath='{.spec.csi.driver}')
[[ "$driver" == driver.longhorn.io ]] || { echo 'FAIL: unexpected CSI driver.' >&2; exit 1; }
second_node=$("${k[@]}" get pod -n "$namespace" persistence-check -o jsonpath='{.spec.nodeName}')
"${k[@]}" get volumes.longhorn.io -n longhorn-system "$volume" -o custom-columns=NAME:.metadata.name,STATE:.status.state,ROBUSTNESS:.status.robustness
printf '\nPASS: Artifactory image pulled, RWO block-backed volume mounted, marker survived pod replacement.\n'
printf 'First node: %s; second node: %s. This is not a node-failure/failover test.\n' "$first_node" "$second_node"
printf 'Inspect test namespace %s and PV %s. Resources are retained for review.\n' "$namespace" "$volume"
printf 'After review, remove only this test namespace. Retain policy means its PV/Longhorn volume needs separate explicit cleanup.\n'
