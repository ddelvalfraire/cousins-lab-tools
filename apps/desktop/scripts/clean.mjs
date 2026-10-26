import { rmSync } from "node:fs";

const outputs = [
  "node_modules",
  "dist",
  "dist-ssr",
  "src-tauri/target",
  "tsconfig.node.tsbuildinfo",
];

for (const output of outputs) {
  rmSync(new URL(`../${output}`, import.meta.url), { recursive: true, force: true });
  console.log(`Cleaned ${output}`);
}
