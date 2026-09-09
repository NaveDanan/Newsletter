#!/usr/bin/env bash
# Read-only. Run on EVERY prospective Longhorn Linux node, preferably with sudo.
set -euo pipefail
data_path=${1:-/var/lib/longhorn}
failed=0
check() {
  local label=$1
  shift
  if "$@"; then printf 'PASS %s\n' "$label"; else printf 'FAIL %s\n' "$label"; failed=1; fi
}
printf 'Node: %s\nArchitecture: %s\n' "$(hostname)" "$(uname -m)"
check 'amd64 bundle matches node' test "$(uname -m)" = x86_64
for executable in bash curl findmnt grep awk blkid lsblk iscsiadm mount.nfs; do
  check "$executable available" sh -c 'command -v "$1" >/dev/null' sh "$executable"
done
check 'iscsid active' systemctl is-active --quiet iscsid
check 'iscsi_tcp module available' sh -c 'test -d /sys/module/iscsi_tcp || modinfo iscsi_tcp >/dev/null 2>&1'
check 'data directory already provisioned' test -d "$data_path"
if [[ -d "$data_path" ]]; then
  filesystem=$(findmnt -T "$data_path" -n -o FSTYPE)
  check 'local ext4/XFS storage' bash -c '[[ "$1" == ext4 || "$1" == xfs ]]' bash "$filesystem"
  df -hT "$data_path"
  findmnt -T "$data_path" -o TARGET,SOURCE,FSTYPE,PROPAGATION
fi
printf '\nAlso check disk capacity for the planned replicas, mount propagation, multipath exclusions, node taints and Pod Security rules using the runbook.\n'
exit "$failed"
