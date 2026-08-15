#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) throw new Error(`${name} is required`);
  return args[index + 1];
};

const sourcePath = valueFor("--source");
const configPath = valueFor("--config");
const check = args.includes("--check");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (!config.output || typeof config.output !== "string") throw new Error("fixture config output is required");

const source = `${fs.readFileSync(sourcePath, "utf8").trimEnd()}\n`;
if (check) {
  if (!fs.existsSync(config.output)) throw new Error(`conformance fixture output not found: ${config.output}`);
  const current = fs.readFileSync(config.output, "utf8");
  if (current !== source) throw new Error(`${config.output} is stale; regenerate conformance fixtures`);
  console.log(`Verified ${config.output} against ${sourcePath}.`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(config.output), { recursive: true });
fs.writeFileSync(config.output, source);
console.log(`Wrote ${config.output} from ${sourcePath}.`);
