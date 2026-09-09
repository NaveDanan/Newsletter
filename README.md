<div align="center">
  <img src="docs/assets/home_page_1774918582850.png" alt="AI-BREAK Newsletter Banner" width="800"/>

  <h1>📰 Newsletter Dashboard & Manager</h1>

  <p>A modern, powerful React + Vite application for comprehensive newsletter production, project management, and task tracking.</p>

  <p>
    <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-7-blue?style=for-the-badge&logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/TailwindCSS-3-blue?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS" />
  </p>

</div>

---

## ✨ Features

- **Newsletter Management:** Curate and write professional newsletters with a built-in rich text editor.
- **Projects & Goals:** Maintain progress across concurrent efforts. Track key milestones.
- **Gantt Edior:** Powerful interactive timeline to organize project schedules at scale.
- **Data Spreadsheets:** Advanced management grids to bulk-update and import tasks seamlessly.

---

## 📸 Guided Tour

### Gantt Editor
Plan intricate task dependencies visually on an interactive drag-and-drop timeline.
![Gantt Editor](docs/assets/gantt_editor_1774918646973.png)

### Projects Portfolio
Oversee all current projects, manage resourcing, and stay updated on milestones.
![Manager Projects](docs/assets/manager_projects_1774918602442.png)

### Goals & Progress Tracking
Track organizational milestones and KPIs against targeted timelines.
![Manager Goals](docs/assets/manager_goals_1774918610316.png)

### Spreadsheet View
Easily analyze, import, and structure bulk data for advanced planning.
![Manager Spreadsheet](docs/assets/manager_spreadsheet_1774918630705.png)

### Production Pipelines
Manage the end-to-end scope from timeline conception to the final curated newsletter.
![Manager Gantt](docs/assets/manager_gantt_1774918623414.png)
![Manager Newsletters](docs/assets/manager_newsletters_1774918593384.png)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/NaveDanan/Newsletter.git
   ```
2. Navigate to the directory:
   ```bash
   cd Newsletter
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
To run the development server:
```bash
npm run dev
```

Your app will be automatically served locally via Vite (default: `http://localhost:5173/` or `5174`).

### Build for Production
```bash
npm run build
```

### Docker
This repo includes a single-container setup that serves the React frontend on port `8080` and PocketBase, including its dashboard UI at `/_/`, on port `8090`.

1. Copy `.env.docker.example` to `.env` or another env file consumed by Docker Compose.
2. Set `POCKETBASE_DIST_DIR` to the extracted Linux PocketBase folder.
3. Set the required superuser and optional app admin credentials.
4. Build and run:

```bash
docker compose --env-file .env up --build
```

If you prefer building and running directly without Compose, use the PocketBase build context explicitly and pass the Docker env file at runtime:

```bash
docker build --build-context pocketbase-dist='C:/Users/naved/Downloads/pocketbase_0.36.9_linux_amd64' -t newsletter:test-rebuild -f Dockerfile .
```
```bash
docker stop newsletter-app && docker rm newsletter-app
```
```bash
docker run -d --name newsletter-app --env-file .env.docker.example -p 8080:8080 -p 8090:8090 --mount "type=bind,src=C:/Users/your-user/Downloads/pocketbase_0.36.8_windows_amd64/pb_data,dst=/pb_data" newsletter:test-rebuild
```

The `--mount` path should point to your existing PocketBase `pb_data` directory if you want the rebuilt container to keep all existing projects, newsletters, and auth data. If you use a new empty directory, the app will start with a fresh PocketBase dataset.

Frontend: `http://localhost:8080`
PocketBase UI: `http://localhost:8090/_/`

Notes:
- The frontend reads PocketBase URL from a runtime `app-config.js`, so the container image is not locked to a single backend URL.
- The container Nginx proxies `/api/*` and `/_/` to the PocketBase process on port `8090`, so browser traffic can use the same public origin as the frontend.
- Destructive collection recreation is disabled by default. Set `POCKETBASE_RECREATE_COLLECTIONS=1` only if you intentionally want startup to drop and recreate the app collections.
- Safe collection schema sync, mail settings sync, users schema sync, and optional app-admin bootstrap run on every start.
- Optional OIDC/SSO provider sync runs on every start when `POCKETBASE_SSO_OIDC_ENABLED=1`.
- Set `APP_PUBLIC_URL` to the public frontend URL. It is used for newsletter article links and the frontend password reset page.
- Leave `POCKETBASE_PUBLIC_URL` empty when you want the frontend to use the same public origin as the app through the built-in Nginx proxy. Set it only if you intentionally expose PocketBase on a separate public address.
- SMTP is configured with the `POCKETBASE_MAIL_*` and `POCKETBASE_SMTP_*` environment variables.

### Kubernetes
Helm chart support is available in `helm/newsletter`.

- Base values: `helm/newsletter/values.yaml`
- Dev example: `helm/newsletter/values.dev.example.yaml`
- Production example: `helm/newsletter/values.production.example.yaml`
- Deployment guide: `docs/kubernetes.md`

### Email Delivery

PocketBase now handles both mail flows server-side:

- Forgot-password emails are sent by PocketBase and link users to `APP_PUBLIC_URL/reset-password/:token`.
- Newsletter publish notifications are sent to subscribed users when a newsletter is first published.
- Admins can also send or resend a published newsletter update from the manager newsletter list.
- Full SMTP and Kubernetes setup guide: `docs/email-delivery.md`

Relevant environment variables:

- `APP_PUBLIC_URL`
- `POCKETBASE_PUBLIC_URL`
- `POCKETBASE_APP_NAME`
- `POCKETBASE_MAIL_SENDER_NAME`
- `POCKETBASE_MAIL_SENDER_ADDRESS`
- `POCKETBASE_SMTP_ENABLED`
- `POCKETBASE_SMTP_HOST`
- `POCKETBASE_SMTP_PORT`
- `POCKETBASE_SMTP_USERNAME`
- `POCKETBASE_SMTP_PASSWORD`
- `POCKETBASE_SMTP_AUTH_METHOD`
- `POCKETBASE_SMTP_TLS`
- `POCKETBASE_SMTP_INSECURE_SKIP_VERIFY`
- `POCKETBASE_SMTP_LOCAL_NAME`
- `POCKETBASE_SSO_OIDC_ENABLED`
- `POCKETBASE_SSO_OIDC_PROVIDER_NAME`
- `POCKETBASE_SSO_OIDC_DISPLAY_NAME`
- `POCKETBASE_SSO_OIDC_CLIENT_ID`
- `POCKETBASE_SSO_OIDC_CLIENT_SECRET`
- `POCKETBASE_SSO_OIDC_AUTH_URL`
- `POCKETBASE_SSO_OIDC_TOKEN_URL`
- `POCKETBASE_SSO_OIDC_USER_INFO_URL`
- `POCKETBASE_SSO_OIDC_PKCE`

---

## Air-gapped Longhorn setup

For a fresh Longhorn installation managed by ArgoCD with images and charts hosted in Artifactory, use the [air-gapped setup guide](docs/longhorn-airgap.md). Prepare the transfer bundle with `scripts/longhorn-airgap/prepare-bundle.ps1`, then run its interactive `wizard.sh` on an internal Linux administration workstation.

## 🛠 Tech Stack Overview

- **Frontend Core:** React, TypeScript, Vite
- **Styling:** Tailwind CSS, Radix UI Primitives, Framer Motion
- **Tooling:** ESLint, Prettier
- **Data Parsing:** `xlsx`, `exceljs`
- **Editor:** Tiptap Headless Editor

> Designed with modern aesthetics and performance built-in.
