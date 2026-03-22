# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-03-22

### Added
- **CI/CD Pipeline** — GitHub Actions workflows for Firebase Hosting
  - `firebase-hosting-merge.yml` — Production deploy on push to `main`
  - `firebase-hosting-pull-request.yml` — Preview deploy on PRs
- **`firebase.json`** — Firebase Hosting config with SPA rewrites and cache headers
- **Documentation** — `CI_CD.md`, `ARCHITECTURE.md`, `CHANGELOG.md`

### Fixed
- **Wire color ignored** — `traceColor` and `wireColor` were duplicate states; user-selected color was not applied to new wires. Consolidated to single `traceColor` state.
- **Export button was a stub** — `exportBoard()` now delegates to `handleExportImage()` for actual PNG export.
- **`routingAngle` type mismatch** — State typed as `'45'|'90'` but UI offered `'any'`. Expanded type union.
- **Double computation** — `getRecommendations()` called twice per render in JSX; now called once and stored.

### Improved
- **A* pathfinder performance** — Replaced `queue.sort()` (O(n log n)) with binary-insertion `enqueue()` (O(log n) search) to maintain priority queue order.
- **SEO** — Updated `index.html` with descriptive `<title>` and `<meta name="description">`.
- **README** — Complete rewrite with features, tech stack, installation, and CI/CD badges.

## [1.0.0] - 2026-03-21

### Added
- Initial release: PCB Wiring Designer with React 19, Vite, TypeScript, TailwindCSS 4
- Visual grid-based PCB editor with drag-and-drop components
- A* smart auto-routing with collision avoidance
- Face/bottom view toggle
- Firebase Auth + Firestore cloud sync
- PNG export via html2canvas
- 20-state undo history
