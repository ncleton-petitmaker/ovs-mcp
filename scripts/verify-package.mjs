#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
const report = JSON.parse(result.stdout)[0];
const paths = report.files.map((file) => file.path);
const forbidden = paths.filter(
  (path) =>
    /(^|\/)(?:session\.json|captures|private)(?:$|\/)/i.test(path) ||
    /\.(?:har|mitm|mobileconfig|pem|key|p12)$/i.test(path) ||
    /^tests\//.test(path) ||
    /^src\//.test(path),
);
if (forbidden.length > 0) {
  console.error(`Package contains forbidden files:\n${forbidden.join("\n")}`);
  process.exit(1);
}
for (const required of [
  "dist/index.js",
  "dist/cli.js",
  "dist/server.js",
  "README.md",
  "LICENSE",
]) {
  if (!paths.includes(required)) {
    console.error(`Package is missing ${required}`);
    process.exit(1);
  }
}
console.log(
  `Package verification passed (${paths.length} files, ${report.size} bytes).`,
);
