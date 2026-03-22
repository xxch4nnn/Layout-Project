# CI/CD Pipeline Documentation

## Overview

This project uses **GitHub Actions** for continuous integration and deployment to **Firebase Hosting**.

```
PR to main    ──→  CI: lint + build + Firebase Preview Deploy
Push to main  ──→  CD: lint + build + Firebase Live Deploy
```

### Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `firebase-hosting-pull-request.yml` | PR to `main` | Type-check, build, deploy to preview channel |
| `firebase-hosting-merge.yml` | Push to `main` | Type-check, build, deploy to production |

### Pipeline Steps

1. **Checkout** — `actions/checkout@v4`
2. **Node.js Setup** — v20 LTS with npm caching (`actions/setup-node@v4`)
3. **Install** — `npm ci` (clean, reproducible install)
4. **Lint** — `npm run lint` (`tsc --noEmit` type-checking)
5. **Build** — `npm run build` (Vite production bundle)
6. **Deploy** — `FirebaseExtended/action-hosting-deploy@v0`

---

## 🔐 Firebase Service Account Setup

The deploy step requires a `FIREBASE_SERVICE_ACCOUNT` GitHub Secret.

### Step 1: Create a Service Account Key

1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Project Settings** → **Service accounts**
2. Click **"Generate new private key"**
3. A `.json` file will download — **keep it secure**

### Step 2: Add the Secret to GitHub

1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Value: Paste the **entire contents** of the downloaded JSON file
5. Click **"Add secret"**

> [!CAUTION]
> Never commit the service account JSON file to your repository. The `.gitignore` already excludes `.env*` files, but you should also ensure any downloaded key files are not in the repo.

### Step 3: Verify

Push a commit to `main` or open a PR. The GitHub Actions tab should show the workflow running and deploying successfully.

---

## 🧪 Adding a Test Framework (Future)

To add **Vitest** to the pipeline:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Add to `vite.config.ts`:
```ts
/// <reference types="vitest" />
export default defineConfig({
  // ...existing config
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
});
```

Then add a test step to both workflow files (after lint, before build):
```yaml
      - name: Run tests
        run: npm test
```

---

## Environment Variables

| Variable | Purpose | Required for Build? |
|----------|---------|-------------------|
| `GEMINI_API_KEY` | Gemini AI API calls | No (runtime only, injected by AI Studio) |
| `APP_URL` | Self-referential URLs | No (runtime only) |
| `VITE_*` | Any Vite-injected env vars | Currently none required |

The Vite build does not currently require any `VITE_`-prefixed environment variables. The Firebase config is loaded from `firebase-applet-config.json` at build time.
