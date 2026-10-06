# Contributing

Thanks for helping. PAR is a small, dependency-free TypeScript library; keep it that way.

## Setup

```sh
npm ci
npm run typecheck   # tsc, strict
npm test            # vitest (jsdom)
npm run build       # dist/: ESM, CJS, IIFE, types
npm run dev         # playground at http://localhost:5173/PAR/
npm run build:site  # site-dist/ (what GitHub Pages serves)
```

## Rules

- Source files stay under 200 lines. Split UI logic from business logic instead of growing a file.
- Every fix to a shared function means checking all its callers in the same change.
- Subtitle timing, ids and ASS tags (for example `{\pos}`) must never be lost: parse and validate, do not trust raw input.
- When you change tag support, update the three READMEs (`README.md`, `README.tr.md`, `README.ru.md`) and
  `site/src/playground/features.ts` together, and add or adjust a playground preset in `site/src/presets/`.
- Add a test in `test/` for every behaviour change. Run typecheck, tests and both builds before opening a PR.

## Maintainers: GitHub Pages

The site is deployed by `.github/workflows/pages.yml` on every push to `main` (typecheck, test, build, then deploy).

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The site is then served at `https://pulsariums.github.io/PAR/`. Vite's `base` (`vite.site.config.ts`) is `/PAR/`;
change it together with the repository name if the repo is ever renamed. `ci.yml` runs typecheck, tests and builds on pull requests.

To use the social preview image, upload `site/public/og.png` under **Settings → General → Social preview**.
