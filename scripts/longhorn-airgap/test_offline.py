import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import offline


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.config = {"REGISTRY_PREFIX": "artifactory.rafael.co.il/docker-local",
                       "HELM_REPO_MODE": "oci", "HELM_REPO_URL": "artifactory.rafael.co.il/helm-local",
                       "REPLICAS": "2", "DATA_PATH": "/var/lib/longhorn", "ARGO_NAMESPACE": "argocd",
                       "ARGO_PROJECT": "default", "KUBE_CONTEXT": "explicit-real-context"}

    def test_manifests_use_internal_source_and_manual_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            offline.generate(self.config, directory)
            app = json.loads((Path(directory) / "longhorn-application.json").read_text())
            values = app["spec"]["source"]["helm"]["valuesObject"]
            self.assertNotIn("automated", app["spec"]["syncPolicy"])
            self.assertNotIn("finalizers", app["metadata"])
            self.assertFalse(values["privateRegistry"]["createSecret"])
            self.assertEqual(values["privateRegistry"]["registryUrl"], self.config["REGISTRY_PREFIX"])
            self.assertEqual(values["global"]["imageRegistry"], self.config["REGISTRY_PREFIX"])
            self.assertFalse(values["preUpgradeChecker"]["jobEnabled"])
            self.assertFalse(values["persistence"]["defaultClass"])
            self.assertEqual(values["persistence"]["reclaimPolicy"], "Retain")

    def test_registry_rejects_public_and_shell_input(self):
        for value in ("docker.io", "ghcr.io/test", "https://artifactory.rafael.co.il", "host;id", "host/$(id)"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                offline.registry_prefix(value)

    def test_dynamic_public_image_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "render.yaml"
            path.write_text('image: artifactory.rafael.co.il/docker-local/longhornio/longhorn-manager:v1.11.2\n'
                            'name: CSI_ATTACHER_IMAGE\nvalue: docker.io/longhornio/csi-attacher:v4.11.0\n')
            with self.assertRaisesRegex(ValueError, "outside Artifactory"):
                offline.audit_render(self.config, path)

    def test_existing_longhorn_stops_without_mutations(self):
        responses = [json.dumps({"items": [{"metadata": {"name": "driver.longhorn.io"}}]}),
                     json.dumps({"items": []})]
        with patch("offline.kubectl", side_effect=responses) as mock:
            with self.assertRaisesRegex(ValueError, "already exist"):
                offline.assert_fresh(self.config)
            self.assertTrue(all(call.args[1] == "get" for call in mock.call_args_list))

    def test_denied_inventory_does_not_mean_absent(self):
        with patch("offline.kubectl", side_effect=subprocess.CalledProcessError(1, ["kubectl"])):
            with self.assertRaises(subprocess.CalledProcessError):
                offline.assert_fresh(self.config)

    def test_cluster_identity_change_stops(self):
        self.config["CLUSTER_UID"] = "expected"
        responses = [json.dumps({"items": []}), json.dumps({"items": []}), json.dumps({"metadata": {"uid": "different"}})]
        with patch("offline.kubectl", side_effect=responses), self.assertRaisesRegex(ValueError, "UID changed"):
            offline.assert_fresh(self.config)

    def test_secret_sent_on_stdin_not_arguments(self):
        with patch("offline.subprocess.run") as run:
            run.return_value.stdout = ""
            offline.apply_secret(self.config, "longhorn-system", "test", {"password": "private-value"})
            argv = run.call_args.args[0]
            self.assertNotIn("private-value", " ".join(argv))
            self.assertIn("--context", argv)
            self.assertIn("--server-side", argv)
            manifest = json.loads(run.call_args.kwargs["input"])
            self.assertEqual(manifest["kind"], "Secret")

    def test_config_is_data_not_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "wizard.env"
            path.write_text("VALUE=$(touch /should-not-exist)\n")
            self.assertEqual(offline.read_config(path)["VALUE"], "$(touch /should-not-exist)")


if __name__ == "__main__":
    unittest.main()
