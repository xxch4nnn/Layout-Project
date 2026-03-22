<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PCB Wiring Designer

<!-- CI/CD Badges -->
![Build & Deploy](https://github.com/xxch4nnn/Layout-Project/actions/workflows/firebase-hosting-merge.yml/badge.svg)
![PR Preview](https://github.com/xxch4nnn/Layout-Project/actions/workflows/firebase-hosting-pull-request.yml/badge.svg)

> A 24×30 prototyping board layout and wiring visualizer for LEDs, sensors, and controls with bottom-side wiring simulation.

## Features

- 🖊️ **Visual PCB Editor** — Drag-and-drop components on a grid-based prototyping board
- ⚡ **Smart Auto-Routing** — A* pathfinding algorithm with collision avoidance
- 🔄 **Face / Bottom View** — Toggle between top-side and bottom-side wiring
- 🎨 **Color-Coded Traces** — VCC (red), GND (black), signal (blue), data (yellow)
- ⚠️ **Design Warnings** — Short circuit detection, floating pin alerts, missing resistor checks
- ☁️ **Cloud Sync** — Firebase Auth + Firestore for cross-device layout persistence
- 📸 **PNG Export** — Capture high-res board screenshots via `html2canvas`
- ↩️ **Undo History** — 20-state deep undo stack

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TailwindCSS 4, Lucide Icons, Framer Motion |
| Language | TypeScript 5.8 |
| Build | Vite 6 |
| Backend | Firebase Auth, Cloud Firestore |
| Hosting | Firebase Hosting |
| CI/CD | GitHub Actions |

## Run Locally

**Prerequisites:** Node.js ≥ 20

```bash
# 1. Clone the repository
git clone https://github.com/xxch4nnn/Layout-Project.git
cd Layout-Project

# 2. Install dependencies
npm install

# 3. Set your environment variables
cp .env.example .env.local
# Edit .env.local with your GEMINI_API_KEY

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) |
| `npm run preview` | Preview production build |

## CI/CD

This project uses GitHub Actions for continuous integration and deployment. Every push to `main` triggers a production deploy to Firebase Hosting, and every PR gets a unique preview URL.

See [CI_CD.md](CI_CD.md) for full pipeline documentation and setup instructions.

## Project Structure

```
Layout-Project/
├── .github/workflows/     # CI/CD pipeline
├── src/
│   ├── App.tsx            # Main application (PCB editor)
│   ├── firebase.ts        # Firebase SDK initialization
│   ├── index.css          # Global styles + TailwindCSS
│   └── main.tsx           # React entry point
├── firebase.json          # Firebase Hosting config
├── firebase-applet-config.json  # Firebase project config
├── firebase-blueprint.json      # Firestore schema
├── firestore.rules        # Firestore security rules
├── index.html             # HTML entry point
├── vite.config.ts         # Vite build config
└── tsconfig.json          # TypeScript config
```

## License

Apache-2.0
