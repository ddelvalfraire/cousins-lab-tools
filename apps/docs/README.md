# User manual

The user manual for the lab applications. It is a [Starlight](https://starlight.astro.build/) site, published at <https://ddelvalfraire.github.io/cousins-lab-tools/>.

Install Node.js 26.12.1 (selected by `.nvmrc`) and Bun 1.4.4. From the repository root:

```sh
cd apps/docs
bun install --frozen-lockfile
bun run dev
```

Build the site into `dist/` and preview the build:

```sh
bun run build
bun run preview
```

Pages live in `src/content/docs/` as Markdown. Pages in `src/content/docs/legacy/` appear in the sidebar automatically, ordered by `sidebar.order`; add other folders to the `sidebar` in `astro.config.mjs`. Start each user guide page with an **Applies to** line that names the application versions it covers.

The site is served from the `/cousins-lab-tools/` sub-path, set by `base` in `astro.config.mjs`. Write links between pages as relative links, such as `[Calibration](../calibration/)`, so that they keep working under that path.

Commit `bun.lock` when dependencies change.

## Continuous integration and publishing

CircleCI builds the site on pull requests that change `apps/docs/` or `.circleci/` (the `docs` section of `.circleci/continue_config.yml`).

To publish the manual, push a `docs-vX.Y.Z` tag, for example `docs-v0.1.0`. A `-rc.N` suffix marks a pre-release, but it still publishes, because there is only one site. The `docs-release` section builds the site and commits the output to the `gh-pages` branch, which GitHub Pages serves. It uses the `GITHUB_TOKEN` from the `github-releases` CircleCI context. `public/.nojekyll` stops GitHub Pages from running Jekyll, which would drop the `_astro/` folder.
