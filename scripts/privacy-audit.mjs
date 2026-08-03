#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

const root = new URL("../", import.meta.url);
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
]);
const forbiddenExtensions = new Set([
  ".har",
  ".mitm",
  ".mobileconfig",
  ".pem",
  ".key",
  ".p12",
]);
const forbiddenNames = [/^session\.json$/i, /\.session\.json$/i, /^\.env$/i];
const findings = [];

for (const path of await walk(root)) {
  const name = path.pathname.split("/").pop() ?? "";
  const projectPath = relative(new URL(root).pathname, path.pathname);
  if (
    forbiddenExtensions.has(extname(name).toLowerCase()) ||
    forbiddenNames.some((pattern) => pattern.test(name))
  ) {
    findings.push(`${projectPath}: forbidden private file type`);
    continue;
  }
  if (name === "package-lock.json") continue;
  const text = await readFile(path, "utf8").catch(() => "");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (/SYNTHETIC|<redacted>|<path>|<file>|YOUR_/i.test(line)) return;
    if (
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(
        line,
      )
    ) {
      findings.push(`${projectPath}:${index + 1}: JWT-shaped value`);
    }
    if (/Bearer\s+[A-Za-z0-9._~+/=-]{30,}/i.test(line)) {
      findings.push(`${projectPath}:${index + 1}: long Bearer value`);
    }
    const uuid = line.match(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    )?.[0];
    if (uuid && uuid !== "00000000-0000-4000-8000-000000000000") {
      findings.push(`${projectPath}:${index + 1}: UUID-shaped value`);
    }
    if (
      /"(?:authorization|token|refreshToken|refresh_token|deviceUuid)"\s*:\s*"(?!SYNTHETIC|<)[^"]{12,}"/i.test(
        line,
      )
    ) {
      findings.push(`${projectPath}:${index + 1}: credential-like literal`);
    }
  });
}

const gitignore = await readFile(
  new URL("../.gitignore", import.meta.url),
  "utf8",
);
for (const required of [
  "*.har",
  "*.mitm",
  "*.mobileconfig",
  "session.json",
  ".env",
  "captures/",
  "private/",
]) {
  if (!gitignore.split("\n").includes(required))
    findings.push(`.gitignore: missing ${required}`);
}

if (findings.length > 0) {
  console.error(
    `Privacy audit failed:\n${findings.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  "Privacy audit passed: no capture, session, token, device UUID, or credential-like value found.",
);

async function walk(directoryUrl) {
  const output = [];
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directoryUrl,
    );
    if (entry.isDirectory()) output.push(...(await walk(child)));
    else if (entry.isFile()) output.push(child);
  }
  return output;
}
