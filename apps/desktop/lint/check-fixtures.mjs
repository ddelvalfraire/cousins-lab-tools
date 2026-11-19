// Each file in lint/fixtures reaches an effect hook in a different way. Biome must reject every one with the ban
// plugin itself: a plugin that fails to load, or a pattern Biome can't run, only yields info diagnostics and passes.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixtures = readdirSync(dir)
  .filter((file) => /\.tsx?$/.test(file))
  .sort();

// lint/fixtures has its own root config, which Biome only uses when it runs from that folder.
const biome = spawnSync('biome', ['lint', '--reporter=github', '.'], {
  cwd: dir,
  encoding: 'utf8',
});
if (biome.error) throw biome.error;

const rejected = new Set();
for (const line of biome.stdout.split('\n')) {
  const match = /^::error title=plugin,file=([^,]+),/.exec(line);
  if (match) rejected.add(basename(match[1]));
}

const missed = fixtures.filter((file) => !rejected.has(file));
for (const file of fixtures)
  console.log(`${missed.includes(file) ? 'MISSED  ' : 'rejected'} ${file}`);

if (!fixtures.length || missed.length || biome.status === 0) {
  console.error(biome.stderr);
  console.error(
    fixtures.length
      ? `The effect ban let ${missed.length} of ${fixtures.length} fixtures through.`
      : 'No fixtures found.',
  );
  process.exit(1);
}
console.log(`The effect ban rejected all ${fixtures.length} fixtures.`);
