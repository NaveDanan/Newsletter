# Kubernetes Deployment

This project ships a Helm chart for the single-container image that serves both:

- the frontend on port `8080`
- PocketBase and the PocketBase UI on port `8090`

The chart is in `helm/newsletter`.

## Important Constraint

Helm deploys a prebuilt container image. It does not build the Docker image from your local PocketBase folder.

Build and push the image first, then point the chart to that image:

```bash
docker build --build-context pocketbase-dist=C:/Users/naved/Downloads/pocketbase_0.36.9_linux_amd64 -t registry.example.com/newsletter:2026.04.12 .
docker push registry.example.com/newsletter:2026.04.12
```

## Chart Files

- `helm/newsletter/values.yaml`: base chart values
- `helm/newsletter/values.dev.example.yaml`: example for local ingress-based dev clusters
- `helm/newsletter/values.production.example.yaml`: example for production-style deployment

Image values are split as follows:

- `image.registry`: optional registry host, for example `ghcr.io` or `registry.example.com`
- `image.repository`: repository path inside that registry, for example `example/newsletter` or `newsletter`
- `image.tag`: image tag

## Credentials

The chart supports two modes:

1. Inline values in `values.yaml` or an override file.
2. An existing Kubernetes secret referenced by `credentials.existingSecret`.

The secret keys expected by the chart are:

- `POCKETBASE_SUPERUSER_EMAIL`
- `POCKETBASE_SUPERUSER_PASSWORD`
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`
- `POCKETBASE_SMTP_USERNAME`
- `POCKETBASE_SMTP_PASSWORD`

The example below assumes the namespace already exists and is mainly for manual Helm installs.
If you deploy with ArgoCD and enable namespace auto-creation, either let the chart create the secret from `credentials.*` values, or sync a Secret or ExternalSecret manifest into the same namespace.

Example:

```bash
kubectl create namespace newsletter

kubectl create secret generic newsletter-pocketbase-env \
  --namespace newsletter \
  --from-literal=POCKETBASE_SUPERUSER_EMAIL=superuser@example.com \
  --from-literal=POCKETBASE_SUPERUSER_PASSWORD=change-this-password \
  --from-literal=POCKETBASE_ADMIN_EMAIL=admin@example.com \
  --from-literal=POCKETBASE_ADMIN_PASSWORD=change-this-password \
  --from-literal=POCKETBASE_SMTP_USERNAME=smtp-user \
  --from-literal=POCKETBASE_SMTP_PASSWORD=smtp-password
```

## Install

Development-style install:

```bash
helm upgrade --install newsletter ./helm/newsletter \
  --namespace newsletter \
  --create-namespace \
  -f ./helm/newsletter/values.dev.example.yaml \
  --set image.registry=ghcr.io \
  --set image.repository=example/newsletter \
  --set image.tag=dev
```

Production-style install:

```bash
helm upgrade --install newsletter ./helm/newsletter \
  --namespace newsletter \
  --create-namespace \
  -f ./helm/newsletter/values.production.example.yaml \
  --set image.registry=registry.example.com \
  --set image.repository=newsletter \
  --set image.tag=2026.04.12
```

## ArgoCD

If you deploy this chart with ArgoCD and want ArgoCD to create the namespace automatically, set the destination namespace on the Application and add `CreateNamespace=true` under `spec.syncPolicy.syncOptions`.

A complete example Application manifest is available in `docs/argocd-application.example.yaml`.

Important detail: `CreateNamespace=true` only creates the namespace. If your chart values use `credentials.existingSecret`, that secret still needs to be created declaratively in the target namespace.

## Mail and Reset Links

Set both public URLs in your values file:

```yaml
env:
  appPublicUrl: https://newsletter.example.com
  pocketbasePublicUrl: https://pb.example.com
```

- `appPublicUrl` is used for newsletter article links and the frontend password-reset page.
- `pocketbasePublicUrl` is written into PocketBase mail settings and other PocketBase-generated URLs.

SMTP settings are exposed directly in chart values, while the SMTP username and password stay in the Kubernetes secret.

## Port Forwarding

If you do not enable ingress, access the app locally with:

```bash
kubectl port-forward svc/newsletter 8080:80 8090:8090 -n newsletter
```

Then open:

- frontend: `http://127.0.0.1:8080`
- PocketBase UI: `http://127.0.0.1:8090/_/`

## Persistence

The chart mounts `/pb_data` from a PVC.

By default it creates a new PVC. If you already have one, set:

```yaml
persistence:
  enabled: true
  existingClaim: newsletter-pb-data
```

## Safe Startup

The container startup is non-destructive by default.

Keep this disabled for existing data:

```yaml
env:
  pocketbaseRecreateCollections: false
```

Only set it to `true` if you explicitly want startup to drop and recreate the app collections.
