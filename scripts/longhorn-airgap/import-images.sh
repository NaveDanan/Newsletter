#!/usr/bin/env bash
# Run INSIDE the disconnected network on a Linux Docker workstation.
set -euo pipefail
umask 077
bundle=${1:?Usage: import-images.sh BUNDLE_DIR ARTIFACTORY_DOCKER_PREFIX}
prefix=${2:?Example: artifactory.rafael.co.il/docker-local}
prefix=${prefix%/}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
python3 "$script_dir/offline.py" verify --bundle "$bundle"
python3 - "$prefix" "$script_dir" <<'PY'
import sys
sys.path.insert(0, sys.argv[2])
from offline import registry_prefix
registry_prefix(sys.argv[1])
PY
host=${prefix%%/*}
read -r -p 'Artifactory Docker writer username: ' registry_user
read -r -s -p 'Artifactory writer token (hidden): ' registry_token
printf '\n'
[[ -n "$registry_user" && -n "$registry_token" ]] || { echo 'Credentials required.' >&2; exit 1; }
docker_config=$(mktemp -d)
trap 'rm -rf -- "$docker_config"' EXIT
printf '%s' "$registry_token" | docker --config "$docker_config" login "$host" --username "$registry_user" --password-stdin
unset registry_token
while IFS= read -r source; do
  [[ -n "$source" ]] || continue
  archive_name=${source//\//_}
  archive_name=${archive_name//:/_}
  docker load -i "$bundle/images/$archive_name.tar"
  # Check the loaded image ID against the connected-side lock before tagging.
  actual=$(docker image inspect --format '{{.Id}}' "docker.io/$source")
  python3 - "$bundle/bundle.json" "$source" "$actual" <<'PY'
import json, sys
lock = json.load(open(sys.argv[1]))
item = next(i for i in lock['images'] if i['source'] == sys.argv[2])
if item['imageId'] != sys.argv[3]:
    raise SystemExit('Loaded image ID does not match bundle lock')
PY
  destination="$prefix/$source"
  docker tag "docker.io/$source" "$destination"
  docker --config "$docker_config" push "$destination"
done < "$bundle/all-images.txt"
printf '\nAll images pushed. Preserve longhornio/ and library/ in repository paths.\n'
