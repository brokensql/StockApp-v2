<div align="center">

<img src="public/icon_512.png" alt="StockApp icon" width="96" />

# StockApp

**A simple way to manage your inventory and sales.**

An offline-first point-of-sale and inventory app for small stores — installable as a PWA on any device, and shipped as a native Android app.

[![Build Android APK](https://github.com/brokensql/StockApp-v2/actions/workflows/build-apk.yml/badge.svg)](https://github.com/brokensql/StockApp-v2/actions/workflows/build-apk.yml)
[![Deploy to GitHub Pages](https://github.com/brokensql/StockApp-v2/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/brokensql/StockApp-v2/actions/workflows/deploy-pages.yml)

[**🚀 Open the live app**](https://brokensql.github.io/StockApp-v2/) · [**📱 Download the latest APK**](https://github.com/brokensql/StockApp-v2/releases/tag/apk-latest)

</div>

---

## ✨ What it does

- **📦 Inventory management** — add and edit products with name, price, stock, category, barcode, and photo; search, filter by category, and spot low-stock items before they run out.
- **📷 Barcode scanning** — scan product barcodes with the device camera (ZXing) to look items up or add them in seconds.
- **🛒 Fast checkout** — quick-sale flow or a full cart with per-item quantities; prices are validated against live stock, and completing a sale automatically deducts inventory. Deleting a sale can restore the stock.
- **🧾 Receipts** — every transaction gets a sequential, collision-free receipt number (`SA-01`, `SA-02`, …). Receipts render as on-screen tickets and can be downloaded/saved as images (on Android they go straight to the gallery).
- **📊 Insights** — revenue and sales-trend charts, a category breakdown donut, and a "most sold products" carousel with gold/silver/bronze medal animations.
- **🏪 Onboarding & store profile** — a guided first-run setup (with Lottie animations) collects the store/owner details that appear on receipts.
- **📶 Works fully offline** — all data lives in IndexedDB (with localStorage mirroring for migration safety). No backend, no account, no API keys — see [`.env.example`](.env.example).
- **💾 Backup & restore** — export/import a full JSON backup, backup reminders, a storage-health check, and a persistent-storage request so the browser won't silently evict your records.
- **📱 PWA + Android** — installable with an auto-updating service worker; the native Android build adds status-bar theming and native file/gallery saving via Capacitor.
- **🇵🇭 PH-ready** — Philippine peso formatting, Asia/Manila date handling, and defaults tuned for local sari-sari store workflows.

## 🧰 Tech stack

| Layer | Tech |
| --- | --- |
| UI | React 19, TypeScript 5.8, Tailwind CSS 4, lucide-react, sonner, framer-motion / motion |
| Build | Vite 6, vite-plugin-pwa (Workbox) |
| Data | IndexedDB (custom repository) + localStorage, Vitest + fake-indexeddb for tests |
| Scanning | @zxing/browser |
| Animations | lottie-web |
| Native | Capacitor 8 (Android, Status Bar, Filesystem, community Media) |
| Extras | html-to-image (receipt export), sharp (image tooling) |
| CI/CD | GitHub Actions (Android APK + GitHub Pages) |

## 🚀 Getting started

Requirements: **Node.js 22 LTS** (matches CI) and npm.

```bash
# Install dependencies (npm ci also works and is reproducible)
npm install

# Start the dev server → http://localhost:3000
npm run dev

# Production build + local preview
npm run build
npm run preview

# Run the test suite
npm test
```

On first launch, the app walks you through onboarding. There is nothing else to configure — no environment variables, no API keys.

> **Note:** please use **npm** for this repo. The lockfile is npm-generated; using bun or other package managers causes lockfile drift that breaks CI.

## 📜 Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 (LAN-accessible) |
| `npm run build` | Production build into `dist/` (assets use a relative base so the same build works under a sub-path and inside the Android WebView) |
| `npm run preview` | Serve the built app on port 3000 |
| `npm run lint` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Vitest suite (uses `fake-indexeddb` for the IndexedDB repository tests) |
| `npm run clean` | Remove the `dist/` build output |

## 🚢 Deployments (CI/CD)

Every push to `main` runs two GitHub Actions workflows:

1. **Deploy to GitHub Pages** (`.github/workflows/deploy-pages.yml`)
   Builds the web app and publishes it to **[brokensql.github.io/StockApp-v2](https://brokensql.github.io/StockApp-v2/)**. Pages is served from GitHub Actions (`enablement: true`), and the Vite build uses relative asset paths so it works correctly under the repo sub-path.
2. **Build Android APK** (`.github/workflows/build-apk.yml`)
   Builds the web app, syncs it into a generated Capacitor Android project, and compiles a **debug APK**. The APK is attached to the rolling prerelease **[`apk-latest`](https://github.com/brokensql/StockApp-v2/releases/tag/apk-latest)** — always the APK from the most recent successful build. Pushing a version tag (`git tag v0.1.0 && git push origin v0.1.0`) additionally creates a **GitHub Release** for that tag with a directly installable APK attached. Until release signing is configured, that APK is the debug-signed build; add the `RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, and `RELEASE_KEY_PASSWORD` repository secrets to switch it to a signed release build.

## 🤖 Building the Android app locally

```bash
npm run build
npx cap add android        # first time only — android/ is generated, not committed
npx cap sync android
cd android
./gradlew assembleDebug    # Windows: gradlew.bat assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## 📁 Project structure

```
├─ src/
│  ├─ components/    # Screens, modals, charts, animation components
│  ├─ db/            # IndexedDB repository (+ tests)
│  ├─ services/      # Storage service
│  ├─ utils/         # Receipts, backup, currency, PH dates, images, PWA update
│  ├─ data/          # Categories and seed data
│  ├─ types.ts       # Shared domain types
│  └─ App.tsx        # App shell, navigation, screen routing
├─ public/           # Icons, fonts, PWA manifest
├─ .github/workflows # build-apk.yml, deploy-pages.yml
├─ capacitor.config.ts
├─ vite.config.ts    # Vite + Tailwind + PWA config (relative base)
└─ package.json
```

## 🔒 Your data stays on your device

StockApp has no backend and makes no network calls with your data. Products, sales, images, and the store profile are stored locally on the device (IndexedDB + localStorage). Clearing browser/app storage deletes them — so use the built-in **Backup** feature to export a JSON snapshot regularly; the app will also remind you.

## 🧷 Keeping the build green (lockfile care)

CI runs `npm ci`, which requires `package.json` and `package-lock.json` to be perfectly in sync — including platform-specific binaries for all platforms.

- Always commit `package.json` **and** `package-lock.json` together.
- After round-tripping the project through Google AI Studio, run a fresh `npm install` before committing so the lockfile is regenerated with full platform coverage.
- Don't mix lockfiles/package managers (the stray `bun.lock` is unused by CI and a known source of drift).
- If CI ever reports `Missing: <package> from lock file`: delete `node_modules` and `package-lock.json`, run `npm install`, and commit the result.

## 🙌 Credits

Bootstrapped with **Google AI Studio** and its Vite + React template.

---

_No license file is included — this is a private project._
