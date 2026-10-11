"""Offline regression checks for the CA wizard and its persistent Helm setting."""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
WIZARD = ROOT / "scripts/artifactory-ca-wizard.sh"
CHART = ROOT / "helm/newsletter"
HELM = os.environ.get("HELM_BINARY") or shutil.which("helm")
HELPER = WIZARD.read_text().split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]


class WizardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.workspace.name)
        cls.root = cls.directory / "company.pem"
        cls.key = cls.directory / "company.key"
        cls.leaf = cls.directory / "server.crt"
        for certificate, key, constraint in [
            (cls.root, cls.key, "CA:TRUE"),
            (cls.leaf, cls.directory / "server.key", "CA:FALSE"),
        ]:
            subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                "-keyout", str(key), "-out", str(certificate), "-days", "1",
                "-subj", "/CN=Wizard test", "-addext", "basicConstraints=critical," + constraint,
            ], check=True, capture_output=True)
        cls.der = cls.directory / "company-der.crt"
        subprocess.run([
            "openssl", "x509", "-in", str(cls.root), "-outform", "DER",
            "-out", str(cls.der),
        ], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.workspace.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)

    def helper(self, *arguments):
        return subprocess.run(
            ["python3", "-c", HELPER, *map(str, arguments)],
            capture_output=True, text=True,
        )

    def test_pem_and_der_are_normalized_and_duplicates_are_removed(self):
        bundle = self.directory / "bundle.pem"
        for certificate in [self.root, self.der, self.root]:
            result = self.helper("cert", certificate, bundle)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(bundle.read_text().count("-----BEGIN CERTIFICATE-----"), 1)
        self.assertEqual(bundle.read_text(), self.root.read_text())

    def test_server_certificates_and_keys_are_rejected_without_partial_writes(self):
        bundle = self.directory / "bundle.pem"
        combined = self.directory / "invalid.pem"
        combined.write_text(self.root.read_text() + self.leaf.read_text())
        for certificate in [self.leaf, self.key, combined]:
            result = self.helper("cert", certificate, bundle)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(bundle.exists())
            self.assertNotIn("BEGIN PRIVATE KEY", result.stdout + result.stderr)

    def test_values_update_preserves_other_settings_and_survives_image_updates(self):
        source, candidate = self.directory / "values.yaml", self.directory / "updated.yaml"
        source.write_text(
            "# Production settings\nimage:\n  repository: registry/newsletter\n  tag: version-one\n"
            "persistence:\n  existingClaim: production-data\n"
            "extraEnv:\n  - name: KEEP_THIS\n    value: present\n"
            "artifactoryCa:\n  bundle: old\n\nservice:\n  type: ClusterIP\n"
        )
        result = self.helper("values", source, self.root, candidate)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(candidate.read_text().startswith("# Production settings"))
        before = yaml.safe_load(source.read_text())
        after = yaml.safe_load(candidate.read_text())
        self.assertEqual(after["artifactoryCa"]["bundle"], self.root.read_text())
        del before["artifactoryCa"], after["artifactoryCa"]
        self.assertEqual(before, after)
        # A repeat run should not duplicate the section.
        again = self.directory / "again.yaml"
        result = self.helper("values", candidate, self.root, again)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(candidate.read_text(), again.read_text())
        updated = yaml.safe_load(again.read_text())
        updated["image"]["tag"] = "version-two"
        self.assertEqual(updated["artifactoryCa"]["bundle"], self.root.read_text())

    def test_conflicting_manual_node_environment_is_reported(self):
        source = self.directory / "conflict.yaml"
        source.write_text("extraEnv:\n  - name: NODE_EXTRA_CA_CERTS\n    value: /old.pem\n")
        candidate = self.directory / "updated.yaml"
        result = self.helper("values", source, self.root, candidate)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("extraEnv", result.stderr)
        self.assertFalse(candidate.exists())

    def test_repository_check_matches_the_importer_and_rejects_credentials(self):
        result = self.helper("url", "https://host/artifactory/api/storage/repo/folder/")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "https://host/artifactory/api/storage/repo/folder?list&deep=1&listFolders=0")
        for value in [
            "http://host/artifactory/repo", "https://reader:private-token@host/artifactory/repo",
            "https://host/artifactory/repo?token=private-token",
        ]:
            result = self.helper("url", value)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("private-token", result.stdout + result.stderr)


@unittest.skipUnless(HELM, "helm is required for chart regression checks")
class ChartTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)

    def render(self, bundle="", tag="version-one", extra=None):
        values = {
            "image": {"repository": "registry/newsletter", "tag": tag},
            "persistence": {"existingClaim": "production-data"},
            "artifactoryCa": {"bundle": bundle},
        }
        if extra:
            values.update(extra)
        file = self.directory / "values.yaml"
        file.write_text(yaml.safe_dump(values))
        result = subprocess.run(
            [HELM, "template", "newsletter", str(CHART), "-f", str(file)],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        documents = [doc for doc in yaml.safe_load_all(result.stdout) if doc]
        deployment = next(doc for doc in documents if doc["kind"] == "Deployment")
        return documents, deployment, result.stdout

    def helper(self, *arguments):
        return subprocess.run(
            ["python3", "-c", HELPER, *map(str, arguments)],
            capture_output=True, text=True,
        )

    def test_disabled_ca_leaves_trust_environment_and_mount_absent(self):
        documents, deployment, _ = self.render()
        pod = deployment["spec"]["template"]["spec"]
        container = pod["containers"][0]
        self.assertFalse(any(doc["kind"] == "ConfigMap" for doc in documents))
        self.assertFalse(any(e["name"] == "NODE_EXTRA_CA_CERTS" for e in container["env"]))
        self.assertEqual([m["name"] for m in container["volumeMounts"]], ["pb-data"])
        self.assertNotIn("checksum/artifactory-ca", deployment["spec"]["template"]["metadata"].get("annotations", {}))

    def test_ca_configmap_mount_and_checksum_persist_across_image_upgrades(self):
        bundle = "-----BEGIN CERTIFICATE-----\ntest-public-ca\n-----END CERTIFICATE-----\n"
        first_checksum = None
        for tag in ["version-one", "version-two"]:
            documents, deployment, _ = self.render(bundle, tag)
            ca = next(doc for doc in documents if doc["kind"] == "ConfigMap")
            pod = deployment["spec"]["template"]
            container = pod["spec"]["containers"][0]
            self.assertEqual(ca["data"]["ca-bundle.pem"].strip(), bundle.strip())
            self.assertEqual(container["image"], "registry/newsletter:" + tag)
            env = next(e for e in container["env"] if e["name"] == "NODE_EXTRA_CA_CERTS")
            self.assertEqual(env["value"], "/etc/newsletter-artifactory-ca/ca-bundle.pem")
            volume = next(v for v in pod["spec"]["volumes"] if v["name"] == "artifactory-ca")
            self.assertEqual(volume["configMap"]["name"], ca["metadata"]["name"])
            mount = next(m for m in container["volumeMounts"] if m["name"] == "artifactory-ca")
            self.assertEqual(mount["mountPath"], "/etc/newsletter-artifactory-ca")
            self.assertTrue(mount["readOnly"])
            checksum = pod["metadata"]["annotations"]["checksum/artifactory-ca"]
            self.assertEqual(checksum, hashlib.sha256(bundle.strip().encode()).hexdigest())
            if first_checksum:
                self.assertEqual(checksum, first_checksum)
            first_checksum = checksum
        _, rotated, _ = self.render(bundle.replace("test-public-ca", "replacement-ca"))
        self.assertNotEqual(rotated["spec"]["template"]["metadata"]["annotations"]["checksum/artifactory-ca"], first_checksum)

    def test_plan_rejects_image_and_data_changes_and_installed_check_rejects_stale_bundle(self):
        _, live, _ = self.render()
        _, installed, plan = self.render("public-ca")
        live_file, plan_file, bundle_file = (
            self.directory / "live.json", self.directory / "plan.yaml", self.directory / "bundle.pem"
        )
        live_file.write_text(json.dumps(live))
        plan_file.write_text(plan)
        bundle_file.write_text("public-ca\n")
        result = self.helper("verify-plan", live_file, plan_file)
        self.assertEqual(result.returncode, 0, result.stderr)
        for field in ["image", "volume"]:
            changed = copy.deepcopy(live)
            if field == "image":
                changed["spec"]["template"]["spec"]["containers"][0]["image"] = "other/image:unexpected"
            else:
                changed["spec"]["template"]["spec"]["volumes"][0]["persistentVolumeClaim"]["claimName"] = "other-data"
            live_file.write_text(json.dumps(changed))
            result = self.helper("verify-plan", live_file, plan_file)
            self.assertNotEqual(result.returncode, 0)
        live_file.write_text(json.dumps(installed))
        result = self.helper("verify-installed", live_file, bundle_file)
        self.assertEqual(result.returncode, 0, result.stderr)
        bundle_file.write_text("different-public-ca")
        self.assertNotEqual(self.helper("verify-installed", live_file, bundle_file).returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
