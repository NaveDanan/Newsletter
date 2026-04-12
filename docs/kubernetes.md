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

## Credentials

The chart supports two modes:

1. Inline values in `values.yaml` or an override file.
2. An existing Kubernetes secret referenced by `credentials.existingSecret`.

The secret keys expected by the chart are:

- `POCKETBASE_SUPERUSER_EMAIL`
- `POCKETBASE_SUPERUSER_PASSWORD`
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`

Example:

```bash
kubectl create namespace newsletter

kubectl create secret generic newsletter-pocketbase-env \
  --namespace newsletter \
  --from-literal=POCKETBASE_SUPERUSER_EMAIL=superuser@example.com \
  --from-literal=POCKETBASE_SUPERUSER_PASSWORD=change-this-password \
  --from-literal=POCKETBASE_ADMIN_EMAIL=admin@example.com \
  --from-literal=POCKETBASE_ADMIN_PASSWORD=change-this-password
```

## Install

Development-style install:

```bash
helm upgrade --install newsletter ./helm/newsletter \
  --namespace newsletter \
  --create-namespace \
  -f ./helm/newsletter/values.dev.example.yaml \
  --set image.repository=ghcr.io/example/newsletter \
  --set image.tag=dev
```

Production-style install:

```bash
helm upgrade --install newsletter ./helm/newsletter \
  --namespace newsletter \
  --create-namespace \
  -f ./helm/newsletter/values.production.example.yaml \
  --set image.repository=registry.example.com/newsletter \
  --set image.tag=2026.04.12
```

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
