---
name: deploy-pages
description: Details of the GitHub Pages deploy workflow (.github/workflows/deploy.yml) — job layout, permissions, pinned action versions and how to re-check them, validation. Use before editing or debugging the deploy workflow.
---

# Deploy workflow (.github/workflows/deploy.yml)

Base-path rules and the Pages-source requirement live in the root CLAUDE.md and always apply.

- `.github/workflows/deploy.yml` runs on every push to `main`, and can be rerun by hand (`workflow_dispatch`).
  - The `build` job: checkout → setup-node (Node from `.nvmrc`, npm cache) → `npm ci` → `npm run build` → configure-pages → upload-pages-artifact (`dist`).
  - The `deploy` job runs deploy-pages into the `github-pages` environment.
  - Permissions: `contents: read`, `pages: write`, `id-token: write`. Concurrency group `pages`, with `cancel-in-progress: false`.
  - Action majors were checked against GitHub's releases on 2026-09-23: checkout@v7, setup-node@v7, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5. Re-check (`gh api repos/actions/<name>/releases/latest`) when bumping; don't copy versions from memory.
  - Validate the workflow with actionlint after any edit.
