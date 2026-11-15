# Keycloak and OIDC sign-in

Newsletter uses PocketBase's authorization-code flow with PKCE. PocketBase exchanges the code with the configured identity provider and reads the provider's authenticated user-info response. Newsletter then uses a PocketBase token for its own requests.

## Automatic sign-in and manual login

When an unsigned-in user opens the site, Newsletter checks for an existing Keycloak session in a hidden iframe using `prompt=none`. A successful check signs the user in without showing a Keycloak login page or leaving the page they opened. Each page load makes at most one automatic attempt.

If the user has no Keycloak session, the provider is unavailable, or the browser blocks iframe cookies, the site stays usable and manual login remains available. The background attempt times out after 15 seconds. Newsletter never opens a visible Keycloak login page automatically.

- Open `/sign-in?manual=1` to use email and password without automatic SSO.
- The **Sign in with SSO** button is available for an explicit, full-page provider login. Successful login returns to the original page when a `returnTo` value was provided.
- Password reset, email verification, unsubscribe, migration, and SSO callback routes do not start automatic SSO.
- **Sign out** clears the Newsletter token and cancels this page's pending SSO work. It keeps the Keycloak session. Refreshing a normal site URL can sign the user back in automatically. Refreshing `/sign-in?manual=1` continues to bypass SSO.

The callback bridge verifies the message's origin and iframe window. The login controller requires the saved `state` and PKCE verifier, expires attempts after 10 minutes, and consumes each attempt once. Temporary values use `sessionStorage`, so separate tabs cannot overwrite each other's login attempts. The callback code is removed from the URL before the exchange; startup logs omit URL query values.

## Keycloak client

Create an OpenID Connect client in the company realm:

- **Client ID:** for example, `newsletter`.
- **Client authentication:** enabled; PocketBase keeps the client secret on the server.
- **Standard flow:** enabled.
- **PKCE method:** `S256`.
- **Valid redirect URI:** the public **frontend** origin followed by `/sso-callback`, for example `https://newsletter.example.com/sso-callback`.
- **Web origins:** the frontend origin, for example `https://newsletter.example.com`.
- Include the `openid`, `profile`, and `email` scopes and the usual user-info mappings. App roles are assigned by Newsletter, not by Keycloak role claims.

Register the exact callback for every supported frontend origin. Production uses HTTPS. Keep the same callback in the browser authorization request and PocketBase code exchange. The app uses `/sso-callback` directly; `/api/oauth2-redirect` belongs to PocketBase's separate popup/realtime helper and is not used by this flow.

Use a stable public frontend origin, with `/api/*` proxied to PocketBase through the included Nginx configuration. A separate public PocketBase address is not needed for browser login.

## Helm configuration

Non-secret settings belong in the deployment values. The client secret belongs in the Kubernetes Secret referenced by `credentials.existingSecret` under the key `POCKETBASE_SSO_OIDC_CLIENT_SECRET`.

```yaml
credentials:
  existingSecret: newsletter-env

env:
  appPublicUrl: https://newsletter.example.com
  pocketbasePublicUrl: ""
  newsletterSsoAutoLogin: true
  pocketbaseSsoOidcEnabled: true
  pocketbaseSsoOidcProviderName: oidc
  pocketbaseSsoOidcDisplayName: Company SSO
  pocketbaseSsoOidcIssuerUrl: https://keycloak.example.com/realms/company
  pocketbaseSsoOidcClientId: newsletter
  pocketbaseSsoOidcPkce: true
  pocketbaseSsoOidcAutoRegister: true
```

The issuer is the realm URL, not the admin console or the discovery-document URL. On startup, the sync script reads `<issuer>/.well-known/openid-configuration`, verifies its issuer, and obtains the authorization, token, and user-info endpoints. Discovery and production provider endpoints require HTTPS; localhost HTTP is supported for tests.

For providers without discovery, leave the issuer blank and set all three existing endpoint values:

```yaml
env:
  pocketbaseSsoOidcAuthUrl: https://provider.example.com/authorize
  pocketbaseSsoOidcTokenUrl: https://provider.example.com/token
  pocketbaseSsoOidcUserInfoUrl: https://provider.example.com/userinfo
```

When an issuer is supplied, its discovered endpoints take precedence. Provider synchronization preserves other providers and existing provider `extra` settings. Put managed settings in deployment configuration so a later restart reproduces them.

`pocketbaseSsoOidcEnabled: false` skips provider synchronization; it does not delete a provider already stored in PocketBase. The committed MMEMS values currently skip synchronization because no production realm/client settings have been supplied. Automatic login safely does nothing if the configured provider is absent.

## New users and viewer access

With `pocketbaseSsoOidcAutoRegister: true`, every new identity authenticated by the configured OIDC provider may join. There is no email-domain allowlist. An email claim is optional; the provider subject identifies the account. The manual sign-up form still requires email. A server hook assigns `role: viewer` and `featuredWriter: false`, regardless of provider role claims or browser `createData`. New users do not need a separate registration form or manual approval.

Existing accounts retain their app-assigned roles. Repeat SSO uses the existing external identity/account link instead of creating another user. Setting auto-registration to `false` rejects new SSO accounts while allowing existing accounts to sign in. This setting controls SSO registration; existing manual registration rules still apply.

Viewers can like, reply/comment, repost, quote, bookmark, and share community posts. Community profiles are created when first needed. Moderation requires a manager or admin role; newsletter editing retains its existing role requirements. A raw browser-supplied JWT cannot create an account or grant privileges.

PocketBase tokens have their own lifetime. Ending a Keycloak session does not by itself revoke an already-issued PocketBase token.

## Docker and runtime settings

The equivalent environment variables are:

```dotenv
NEWSLETTER_SSO_AUTO_LOGIN=1
POCKETBASE_SSO_OIDC_ENABLED=1
POCKETBASE_SSO_OIDC_PROVIDER_NAME=oidc
POCKETBASE_SSO_OIDC_ISSUER_URL=https://keycloak.example.com/realms/company
POCKETBASE_SSO_OIDC_CLIENT_ID=newsletter
POCKETBASE_SSO_OIDC_CLIENT_SECRET=<server-side secret>
POCKETBASE_SSO_OIDC_PKCE=1
POCKETBASE_SSO_OIDC_AUTO_REGISTER=1
```

The container publishes only `SSO_AUTO_LOGIN` and `SSO_PROVIDER` to `app-config.js`. It never publishes the client secret or server credentials. The defaults enable background attempts and viewer auto-registration; a configured provider is still required.

## Microsoft Entra ID

The same flow can use Entra ID. Register a **Web** application with `https://newsletter.example.com/sso-callback`, create a server-side client secret, and use your tenant's authorize/token endpoints plus `https://graph.microsoft.com/oidc/userinfo`. Keep the provider name `oidc`, or set the same configured provider name in the deployment and PocketBase. Request `openid`, `profile`, and `email` scopes.

## Validation

- Existing Keycloak session: open a community post; the browser stays on that post and signs in without a visible provider page.
- No Keycloak session or blocked cookies: the site stays usable and email/password login works.
- New SSO identity: a single viewer account is created; liking, commenting and reposting work; moderation is denied.
- Existing manager/admin identity: its role remains unchanged.
- Sign out: the current page remains signed out; refreshing a normal URL silently reconnects when the Keycloak session remains active.
- Missing/mismatched `state`, expired attempts, and invalid codes fail without creating an account.

Run `npm run test:sso` for the browser-flow checks. Run `SSO_TEST_PB_BINARY=/path/to/pocketbase npm run test:sso-api` against a local PocketBase 0.36.9 binary for real OIDC exchange, account provisioning, and community permission checks. This test creates and removes its own database under `.tmp`.
