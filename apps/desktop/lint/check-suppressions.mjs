// A biome-ignore comment silences the effect ban and the import boundaries as easily as any other rule: the plugins
// report under lint/plugin, and the effect ban's import half is lint/style/noRestrictedImports. This fails on any such
// suppression in the app. Each file in lint/suppressions/fixtures must be caught, except *.allowed.ts files, which
// suppress unrelated rules and must not be.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(app, 'lint/suppressions/fixtures');
const skipped = new Set([
  'node_modules',
  'dist',
  'storybook-static',
  'test-results',
  'playwright-report',
  'src-tauri',
]);
const suppression =
  /biome-ignore(?:-all|-start)?\s+lint(?:\/plugin(?:\/[\w-]+)?|\/style(?:\/noRestrictedImports)?)?(?=[\s:(]|$)/m;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return skipped.has(entry.name) || path === fixtures ? [] : sources(path);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

const caught = (path) => suppression.test(readFileSync(path, 'utf8'));

const wrong = [];
const fixtureFiles = readdirSync(fixtures).sort();
for (const name of fixtureFiles) {
  const allowed = name.endsWith('.allowed.ts');
  const ok = caught(join(fixtures, name)) !== allowed;
  if (!ok) wrong.push(name);
  console.log(
    `${ok ? (allowed ? 'allowed ' : 'caught  ') : allowed ? 'FLAGGED ' : 'MISSED  '} ${name}`,
  );
}
const found = sources(app)
  .filter(caught)
  .map((path) => relative(app, path));

if (!fixtureFiles.length || wrong.length) {
  console.error(
    fixtureFiles.length
      ? `The suppression check got ${wrong.length} of ${fixtureFiles.length} fixtures wrong.`
      : 'No fixtures found.',
  );
  process.exit(1);
}
if (found.length) {
  for (const file of found) console.error(`suppressed ${file}`);
  console.error(
    `${found.length} file(s) suppress the effect ban or the import boundaries. Fix the import instead.`,
  );
  process.exit(1);
}
console.log(
  `No suppressions of the effect ban or import boundaries; all ${fixtureFiles.length} fixtures behave.`,
);
