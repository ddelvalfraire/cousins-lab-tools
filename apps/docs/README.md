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
