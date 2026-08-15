#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const sourcePath = argument("--source", "contracts/api-client-conformance-v2.md");
const configPath = argument("--config", "conformance.config.json");
const check = process.argv.includes("--check");

if (!fs.existsSync(sourcePath)) {
  console.error(`Shared conformance source not found: ${sourcePath}`);
  process.exit(1);
}
if (!fs.existsSync(configPath)) {
  console.error(`Conformance generator config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const outputPath = config.output ?? "CONFORMANCE.md";
const appendFiles = config.appendFiles ?? [];
if (!Array.isArray(appendFiles)) {
  console.error("appendFiles must be an array of repository-relative paths");
  process.exit(1);
}

const sections = [fs.readFileSync(sourcePath, "utf8").trimEnd()];
for (const appendPath of appendFiles) {
  if (!fs.existsSync(appendPath)) {
    console.error(`Conformance appendix not found: ${appendPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(appendPath, "utf8").trim();
  if (content) sections.push(content);
}
const expected = `${sections.join("\n\n")}\n`;

if (check) {
  const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (actual !== expected) {
    console.error(`${outputPath} is stale. Regenerate it from the shared conformance contract.`);
    process.exit(1);
  }
  console.log(`${outputPath} is up to date.`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected);
  console.log(`Generated ${outputPath}.`);
}
