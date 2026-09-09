#!/usr/bin/env python3
"""Offline manifest/credential helpers. No third-party Python packages required."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

VERSION = "1.11.2"


def read_config(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError("Invalid configuration line")
        result[key] = value
    return result


def registry_prefix(value):
    value = value.rstrip("/")
    if not re.fullmatch(r"[a-z0-9.-]+(?::[0-9]+)?(?:/[a-z0-9._-]+)*", value):
        raise ValueError("Use the Docker push prefix without https://, credentials, or a tag")
    host = value.split("/")[0].split(":")[0]
    if "." not in host and host != "localhost":
        raise ValueError("Use a fully qualified internal registry hostname")
    if host in {"docker.io", "registry-1.docker.io", "ghcr.io", "quay.io", "registry.k8s.io"}:
        raise ValueError("A public registry is not an air-gap destination")
    return value


def write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2) + "\n")


def verify_bundle(directory):
    directory = Path(directory).resolve()
    checked = set()
    for line in (directory / "SHA256SUMS").read_text().splitlines():
        digest, relative = line.split("  ", 1)
        path = (directory / relative).resolve()
        if not path.is_relative_to(directory) or not path.is_file():
            raise ValueError(f"Missing or invalid bundle member: {relative}")
        with path.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else file_hash(stream)
        if digest != actual:
            raise ValueError(f"Checksum mismatch: {relative}")
        checked.add(relative)
    metadata = json.loads((directory / "bundle.json").read_text())
    if metadata["longhornVersion"] != VERSION or not metadata["complete"]:
        raise ValueError("This is not a complete image bundle for the pinned version")
    expected = set((directory / "all-images.txt").read_text().splitlines())
    if expected != {item["source"] for item in metadata["images"]}:
        raise ValueError("Image lock and required image list differ")
    required = {"bundle.json", "all-images.txt", "longhorn-images.txt", f"longhorn-{VERSION}.tgz",
                "wizard.sh", "offline.py", "import-images.sh", "verify-storage.sh", "node-check.sh",
                "tools/helm-linux-amd64.tar.gz", "tools/longhornctl"}
    required.update(item["archive"] for item in metadata["images"])
    if not required.issubset(checked):
        raise ValueError("Bundle checksum list omits required files")
    print(f"Verified complete {VERSION} bundle: {len(expected)} images")


def file_hash(stream):
    digest = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(block)
    return digest.hexdigest()


def generate(config, output):
    prefix = registry_prefix(config["REGISTRY_PREFIX"])
    repo = config["HELM_REPO_URL"].rstrip("/")
    mode = config["HELM_REPO_MODE"]
    if mode == "oci":
        registry_prefix(repo)
    elif mode != "legacy" or not re.fullmatch(r"https://[a-zA-Z0-9.:/-]+", repo):
        raise ValueError("Legacy Helm URL must use HTTPS; OCI URL omits the scheme")
    if "charts.longhorn.io" in repo:
        raise ValueError("ArgoCD must read its chart from Artifactory")
    replicas = int(config["REPLICAS"])
    if replicas not in (1, 2, 3):
        raise ValueError("Choose 1, 2 or 3 storage replicas")
    data_path = config["DATA_PATH"]
    if not re.fullmatch(r"/[A-Za-z0-9_./-]+", data_path) or data_path in ("/", "/var", "/var/lib") or ".." in data_path.split("/"):
        raise ValueError("Choose a dedicated absolute Longhorn data directory")
    for key in ("ARGO_NAMESPACE", "ARGO_PROJECT"):
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*", config[key]):
            raise ValueError(f"Invalid {key}")
    values = {
        "global": {"imageRegistry": prefix},
        "privateRegistry": {"createSecret": False, "registryUrl": prefix, "registrySecret": "longhorn-artifactory-pull"},
        "image": {"pullPolicy": "Always"},
        "preUpgradeChecker": {"jobEnabled": False},
        "persistence": {"defaultClass": False, "defaultClassReplicaCount": replicas, "reclaimPolicy": "Retain"},
        "defaultSettings": {"defaultDataPath": data_path, "defaultReplicaCount": {"v1": str(replicas), "v2": str(replicas)},
                            "upgradeChecker": False, "v2DataEngine": False,
                            "systemManagedPodsImagePullPolicy": "always"},
        "ingress": {"enabled": False},
    }
    application = {
        "apiVersion": "argoproj.io/v1alpha1", "kind": "Application",
        "metadata": {"name": "longhorn", "namespace": config["ARGO_NAMESPACE"],
                     "labels": {"app.kubernetes.io/managed-by": "longhorn-airgap-wizard"}},
        "spec": {"project": config["ARGO_PROJECT"],
                 "source": {"repoURL": repo, "chart": "longhorn", "targetRevision": VERSION,
                            "helm": {"releaseName": "longhorn", "valuesObject": values}},
                 "destination": {"server": "https://kubernetes.default.svc", "namespace": "longhorn-system"},
                 "syncPolicy": {"syncOptions": ["CreateNamespace=true"]}},
    }
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "longhorn-values.json", values)
    write_json(output / "longhorn-application.json", application)
    host = prefix.split("/")[0]
    write_json(output / "k3s-registries.fragment.json", {
        "mirrors": {host: {"endpoint": ["https://" + host]}},
        "configs": {host: {"tls": {"ca_file": "/etc/rancher/k3s/artifactory-ca.crt"}}},
    })
    print(f"Generated values, ArgoCD Application and optional K3s CA fragment in {output}")


def kubectl(config, *args, manifest=None):
    return subprocess.run(["kubectl", "--context", config["KUBE_CONTEXT"], "--request-timeout=30s", *args],
                          input=None if manifest is None else json.dumps(manifest), text=True,
                          check=True, capture_output=True).stdout


def assert_fresh(config):
    # List calls fail closed on RBAC/network errors; a denied read is not absence.
    drivers = json.loads(kubectl(config, "get", "csidrivers", "-o", "json"))["items"]
    crds = json.loads(kubectl(config, "get", "crds", "-o", "json"))["items"]
    if any(item["metadata"]["name"] == "driver.longhorn.io" for item in drivers) or any(
        item["metadata"]["name"].endswith(".longhorn.io") for item in crds
    ):
        raise ValueError("Longhorn or its CRDs already exist. Fresh-install wizard stopped; do not uninstall it to proceed.")
    namespace = json.loads(kubectl(config, "get", "namespace", "kube-system", "-o", "json"))
    uid = namespace["metadata"]["uid"]
    if config.get("CLUSTER_UID") and uid != config["CLUSTER_UID"]:
        raise ValueError("Cluster UID changed since planning. Stop and recheck the selected kubeconfig.")
    print(uid)


def apply_secret(config, namespace, name, data, kind="Opaque", labels=None):
    manifest = {"apiVersion": "v1", "kind": "Secret", "metadata": {"name": name, "namespace": namespace},
                "type": kind, "data": {key: base64.b64encode(value.encode()).decode() for key, value in data.items()}}
    if labels:
        manifest["metadata"]["labels"] = labels
    # Secret contents are sent over stdin, never as command arguments or a saved file.
    kubectl(config, "apply", "--server-side", "--field-manager=longhorn-airgap-wizard", "-f", "-", manifest=manifest)
    print(f"Configured Secret {namespace}/{name}")


def credentials(config):
    assert_fresh(config)
    prefix = registry_prefix(config["REGISTRY_PREFIX"])
    host = prefix.split("/")[0]
    user = os.environ["LH_PULL_USER"]
    token = os.environ["LH_PULL_TOKEN"]
    repo_user = os.environ["LH_HELM_USER"]
    repo_token = os.environ["LH_HELM_TOKEN"]
    if not all((user, token, repo_user, repo_token)):
        raise ValueError("Read credentials cannot be empty")
    ns = {"apiVersion": "v1", "kind": "Namespace", "metadata": {"name": "longhorn-system"}}
    kubectl(config, "apply", "--server-side", "--field-manager=longhorn-airgap-wizard", "-f", "-", manifest=ns)
    auth = {"auths": {host: {"auth": base64.b64encode(f"{user}:{token}".encode()).decode()}}}
    apply_secret(config, "longhorn-system", "longhorn-artifactory-pull", {".dockerconfigjson": json.dumps(auth)}, "kubernetes.io/dockerconfigjson")
    repository = {"type": "helm", "url": config["HELM_REPO_URL"].rstrip("/"), "username": repo_user, "password": repo_token}
    if config["HELM_REPO_MODE"] == "oci":
        repository["enableOCI"] = "true"
    apply_secret(config, config["ARGO_NAMESPACE"], "longhorn-artifactory-helm", repository,
                 labels={"argocd.argoproj.io/secret-type": "repository"})


def audit_render(config, manifest):
    prefix = registry_prefix(config["REGISTRY_PREFIX"]) + "/"
    text = Path(manifest).read_text()
    # Covers pod image fields, CSI image environment values and default image settings.
    references = set(re.findall(r"(?:[a-zA-Z0-9.-]+(?::[0-9]+)?/)?(?:[a-zA-Z0-9._-]+/)+(?:[a-zA-Z0-9._-]+):[a-zA-Z0-9._-]+", text))
    if not references:
        raise ValueError("No image references were found in the render")
    outside = sorted(ref for ref in references if not ref.startswith(prefix))
    if outside:
        raise ValueError("Images outside Artifactory: " + ", ".join(outside))
    print(f"Checked {len(references)} distinct rendered image references: all use {prefix}")


def apply_application(config, path):
    assert_fresh(config)
    desired = json.loads(Path(path).read_text())
    existing = kubectl(config, "get", "application", "longhorn", "-n", config["ARGO_NAMESPACE"],
                       "--ignore-not-found", "-o", "json").strip()
    if existing:
        app = json.loads(existing)
        if app.get("metadata", {}).get("labels", {}).get("app.kubernetes.io/managed-by") != "longhorn-airgap-wizard":
            raise ValueError("An independently managed longhorn Application already exists; review it instead of overwriting it")
        if app["spec"] != desired["spec"]:
            raise ValueError("Existing Application differs from this plan; review the change outside the fresh-install wizard")
    kubectl(config, "apply", "-f", "-", manifest=desired)
    print("Created/reconciled the reviewed Longhorn Application; sync remains manual")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["verify", "generate", "fresh", "credentials", "audit", "application"])
    parser.add_argument("--config")
    parser.add_argument("--bundle")
    parser.add_argument("--output")
    parser.add_argument("--manifest")
    args = parser.parse_args()
    if args.action == "verify":
        verify_bundle(args.bundle)
        return
    config = read_config(args.config)
    if args.action == "generate": generate(config, args.output)
    elif args.action == "fresh": assert_fresh(config)
    elif args.action == "credentials": credentials(config)
    elif args.action == "audit": audit_render(config, args.manifest)
    elif args.action == "application": apply_application(config, args.manifest)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        # Do not echo kubectl input or raw server responses that could include secrets.
        print(f"Kubernetes command failed (exit {exc.returncode}). Check access, resource existence and RBAC.", file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, OSError) as exc:
        print(f"Stopped: {exc}", file=sys.stderr)
        sys.exit(1)
