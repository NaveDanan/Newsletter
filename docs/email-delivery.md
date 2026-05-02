# Email Delivery Setup

This app sends mail through PocketBase. The React app calls PocketBase, and PocketBase sends the actual email using the SMTP settings stored in PocketBase settings.

Newsletter update emails use the same SMTP configuration as password reset emails.

## Why "0 subscribers" Can Appear

The manager toast currently reports how many emails were successfully sent, not how many users or subscribers exist.

If SMTP is not configured yet, PocketBase cannot deliver the messages. The send action can therefore finish with:

```text
Newsletter update sent to 0 subscribers
```

That means `0` emails were sent successfully. It does not necessarily mean there are no users.

Registered users are synced into the `newsletter_subscribers` collection by the PocketBase hooks. The sync also runs when newsletter stats or send-update endpoints are called. After SMTP is configured, send again and check the PocketBase logs if the count is still `0`.

## Required SMTP Details

Get these values from your email provider:

- SMTP host, for example `smtp.sendgrid.net`, `smtp.mailgun.org`, `email-smtp.us-east-1.amazonaws.com`
- SMTP port, usually `587`
- SMTP username
- SMTP password or API key
- Auth method, usually `PLAIN`
- TLS mode
- Verified sender address, for example `newsletter@example.com`

Recommended baseline:

```env
POCKETBASE_MAIL_SENDER_NAME=AI-BREAK
POCKETBASE_MAIL_SENDER_ADDRESS=newsletter@example.com
POCKETBASE_SMTP_ENABLED=1
POCKETBASE_SMTP_HOST=smtp.example.com
POCKETBASE_SMTP_PORT=587
POCKETBASE_SMTP_USERNAME=your-smtp-user
POCKETBASE_SMTP_PASSWORD=your-smtp-password-or-api-key
POCKETBASE_SMTP_AUTH_METHOD=PLAIN
POCKETBASE_SMTP_TLS=0
POCKETBASE_SMTP_INSECURE_SKIP_VERIFY=0
POCKETBASE_SMTP_LOCAL_NAME=
```

For port `587`, keep `POCKETBASE_SMTP_TLS=0`; STARTTLS is negotiated after connecting. For implicit TLS on port `465`, set `POCKETBASE_SMTP_TLS=1` if your provider requires it.

`POCKETBASE_SMTP_INSECURE_SKIP_VERIFY=1` disables SMTP TLS certificate verification through the app mail hook. Use it only in development environments with a self-signed SMTP server. Keep it `0` in production.

## Sender Domain Requirements

Most SMTP providers require the sender domain to be verified before they allow real delivery.

Configure these DNS records in the domain used by `POCKETBASE_MAIL_SENDER_ADDRESS`:

- SPF record from your provider
- DKIM records from your provider
- DMARC record, at least a basic policy such as `p=none` while testing

Example DMARC record:

```text
Name: _dmarc.example.com
Type: TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@example.com
```

Do not use a random sender address. If the sender address is `newsletter@example.com`, the SMTP provider must be allowed to send as `example.com`.

## Local Docker Setup

Update `.env` or `.env.docker.example`:

```env
APP_PUBLIC_URL=http://localhost:8080
POCKETBASE_APP_NAME=AI-BREAK
POCKETBASE_MAIL_SENDER_NAME=AI-BREAK
POCKETBASE_MAIL_SENDER_ADDRESS=newsletter@example.com
POCKETBASE_SMTP_ENABLED=1
POCKETBASE_SMTP_HOST=smtp.example.com
POCKETBASE_SMTP_PORT=587
POCKETBASE_SMTP_USERNAME=your-smtp-user
POCKETBASE_SMTP_PASSWORD=your-smtp-password
POCKETBASE_SMTP_AUTH_METHOD=PLAIN
POCKETBASE_SMTP_TLS=0
POCKETBASE_SMTP_INSECURE_SKIP_VERIFY=0
```

Restart the container:

```bash
docker compose --env-file .env up --build
```

On startup, `scripts/sync-pocketbase-mail-settings.mjs` writes these values into PocketBase mail settings.

## Kubernetes Setup With Helm

The Helm chart already passes SMTP settings into the container and stores SMTP credentials in a Kubernetes Secret.

### 1. Create Or Update The Secret

If you use `credentials.existingSecret`, create the Secret in the same namespace as the release:

```bash
kubectl create namespace newsletter

kubectl create secret generic newsletter-pocketbase-env \
  --namespace newsletter \
  --from-literal=POCKETBASE_SUPERUSER_EMAIL=superuser@example.com \
  --from-literal=POCKETBASE_SUPERUSER_PASSWORD=change-this-password \
  --from-literal=POCKETBASE_ADMIN_EMAIL=admin@example.com \
  --from-literal=POCKETBASE_ADMIN_PASSWORD=change-this-password \
  --from-literal=POCKETBASE_SMTP_USERNAME=your-smtp-user \
  --from-literal=POCKETBASE_SMTP_PASSWORD=your-smtp-password
```

For an existing Secret:

```bash
kubectl create secret generic newsletter-pocketbase-env \
  --namespace newsletter \
  --from-literal=POCKETBASE_SUPERUSER_EMAIL=superuser@example.com \
  --from-literal=POCKETBASE_SUPERUSER_PASSWORD=change-this-password \
  --from-literal=POCKETBASE_ADMIN_EMAIL=admin@example.com \
  --from-literal=POCKETBASE_ADMIN_PASSWORD=change-this-password \
  --from-literal=POCKETBASE_SMTP_USERNAME=your-smtp-user \
  --from-literal=POCKETBASE_SMTP_PASSWORD=your-smtp-password \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2. Set Helm Values

In your production values file:

```yaml
credentials:
  existingSecret: newsletter-pocketbase-env

env:
  appPublicUrl: https://newsletter.example.com
  pocketbasePublicUrl: https://pb.example.com
  pocketbaseAppName: AI-BREAK
  pocketbaseMailSenderName: AI-BREAK
  pocketbaseMailSenderAddress: newsletter@example.com
  pocketbaseSmtpEnabled: true
  pocketbaseSmtpHost: smtp.example.com
  pocketbaseSmtpPort: 587
  pocketbaseSmtpAuthMethod: PLAIN
  pocketbaseSmtpTls: false
  pocketbaseSmtpInsecureSkipVerify: false
  pocketbaseSmtpLocalName: ""
```

Deploy:

```bash
helm upgrade --install newsletter ./helm/newsletter \
  --namespace newsletter \
  --create-namespace \
  -f ./helm/newsletter/values.production.example.yaml \
  --set image.registry=registry.example.com \
  --set image.repository=newsletter \
  --set image.tag=2026.04.12
```

The container syncs mail settings into PocketBase on startup. After changing SMTP values, restart the deployment:

```bash
kubectl rollout restart deployment/newsletter -n newsletter
kubectl rollout status deployment/newsletter -n newsletter
```

## Make Sure Kubernetes Can Reach SMTP

Your cluster must allow outbound traffic from the newsletter pod to the SMTP host and port.

Check common blockers:

- Cloud provider blocks outbound port `25`; use `587` instead.
- A Kubernetes `NetworkPolicy` blocks egress.
- A firewall or NAT gateway blocks the SMTP host or port.
- The SMTP provider only allows traffic from approved source IPs.

### Test TCP Egress From The Running Pod

Find the pod:

```bash
kubectl get pods -n newsletter -l app.kubernetes.io/name=newsletter
```

Test port `587` from inside the pod:

```bash
kubectl exec -n newsletter deploy/newsletter -- node -e "const net=require('net'); const s=net.createConnection(587,'smtp.example.com'); s.setTimeout(8000); s.on('connect',()=>{console.log('smtp tcp ok'); s.end();}); s.on('timeout',()=>{console.error('smtp tcp timeout'); process.exit(1);}); s.on('error',(e)=>{console.error(e.message); process.exit(1);});"
```

For implicit TLS on port `465`:

```bash
kubectl exec -n newsletter deploy/newsletter -- node -e "const tls=require('tls'); const s=tls.connect(465,'smtp.example.com',()=>{console.log('smtp tls ok'); s.end();}); s.setTimeout(8000); s.on('timeout',()=>{console.error('smtp tls timeout'); process.exit(1);}); s.on('error',(e)=>{console.error(e.message); process.exit(1);});"
```

If this test fails, fix cluster egress before debugging the app.

### Example NetworkPolicy Egress Rule

Only use this if your namespace has restrictive NetworkPolicies. Kubernetes NetworkPolicy cannot reliably target a DNS hostname, so this example allows outbound TCP `587` to the internet:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: newsletter-allow-smtp-egress
  namespace: newsletter
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: newsletter
  policyTypes:
    - Egress
  egress:
    - ports:
        - protocol: TCP
          port: 587
```

If your provider publishes fixed SMTP IP ranges, prefer restricting egress to those CIDRs.

## Verify In PocketBase

Open the PocketBase UI:

```text
https://pb.example.com/_/
```

Check:

- Settings -> Mail settings has SMTP enabled.
- Sender name and sender address are correct.
- `newsletter_subscribers` contains active subscribers.
- The newsletter record has `status = published`.

You can also check the app stats endpoint:

```bash
curl https://newsletter.example.com/api/newsletter/stats
```

Expected shape:

```json
{
  "activeSubscribers": 3,
  "publishedNewsletters": 1
}
```

## Send A Test

1. Sign in as an `admin`.
2. Open Manager -> Newsletters.
3. Find a published newsletter.
4. Click the mail icon.
5. Watch the toast count and the pod logs.

Logs:

```bash
kubectl logs -n newsletter deploy/newsletter --tail=200 -f
```

If delivery fails, PocketBase logs lines like:

```text
Failed to send newsletter notification to user@example.com: ...
```

## Troubleshooting

### The toast still says 0

Check these in order:

1. SMTP is enabled in PocketBase settings.
2. The pod can reach the SMTP host and port.
3. SMTP username and password are correct.
4. For self-signed SMTP in dev only, `POCKETBASE_SMTP_INSECURE_SKIP_VERIFY=1` or `pocketbaseSmtpInsecureSkipVerify: true` is set.
5. Sender address is verified by the SMTP provider.
6. `newsletter_subscribers` has records with `isActive = true`.
7. Pod logs do not show authentication, TLS, or relay-denied errors.

### Users exist but subscribers are missing

Call the stats endpoint or send action once. The hooks sync registered users into `newsletter_subscribers`.

```bash
curl https://newsletter.example.com/api/newsletter/stats
```

Then check the collection again in PocketBase.

### Authentication fails

Try the provider's exact recommended SMTP values. Common examples:

- SendGrid: host `smtp.sendgrid.net`, port `587`, username `apikey`, password is the API key.
- Mailgun: host usually `smtp.mailgun.org`, port `587`, username and password from the domain SMTP credentials.
- Amazon SES: host depends on region, port `587`, username and password must be generated SMTP credentials, not the AWS access key.

### Gmail or Microsoft 365

Personal Gmail usually requires an app password and may still block server-side sending. For production, use a transactional provider such as SES, SendGrid, Mailgun, Postmark, or Resend SMTP.

Microsoft 365 often requires SMTP AUTH to be enabled for the mailbox or tenant.

## Production Checklist

- `APP_PUBLIC_URL` points to the public frontend URL.
- `POCKETBASE_PUBLIC_URL` points to the public PocketBase URL if PocketBase is exposed separately.
- SMTP is enabled.
- SMTP host, port, auth method, TLS mode, username, and password are configured.
- `POCKETBASE_SMTP_INSECURE_SKIP_VERIFY` is disabled.
- Sender address uses a verified domain.
- SPF, DKIM, and DMARC are configured.
- Kubernetes egress allows TCP to the SMTP host and port.
- Pod was restarted after configuration changes.
- `newsletter_subscribers` has active subscribers.
- Test send works before sending to all users.
