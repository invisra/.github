#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const configPath = argument("--config", "public-api-surface.json");
if (!fs.existsSync(configPath)) throw new Error(`public API surface config not found: ${configPath}`);

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (config.schemaVersion !== 1) throw new Error("public-api-surface.json schemaVersion must be 1");

let checked = 0;
if (config.typescript) {
  validateTypeScript(config.typescript);
  checked += config.typescript.required.length;
}
if (config.python) {
  validatePython(config.python);
  checked += config.python.required.length;
}
if (checked === 0) throw new Error("public API surface config must define at least one required symbol");

console.log(`Validated ${checked} required public API symbol(s) from ${configPath}.`);

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function validateTypeScript(section) {
  validateSection(section, "typescript");
  const entrypoint = path.resolve(section.entrypoint);
  const exports = collectTypeScriptExports(entrypoint, new Set());
  assertRequired("TypeScript", section.required, exports);
}

function collectTypeScriptExports(filePath, visited) {
  const resolved = resolveTypeScriptFile(filePath);
  if (visited.has(resolved)) return new Set();
  visited.add(resolved);

  const source = fs.readFileSync(resolved, "utf8");
  const exported = new Set();

  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["'](.+?)["']/g)) {
    for (const item of match[1].split(",")) {
      const cleaned = item.trim().replace(/^type\s+/, "");
      if (!cleaned) continue;
      const alias = cleaned.split(/\s+as\s+/);
      exported.add((alias[1] ?? alias[0]).trim());
    }
  }

  for (const match of source.matchAll(/export\s+\*\s+from\s+["'](.+?)["']/g)) {
    const target = resolveRelativeModule(resolved, match[1]);
    for (const symbol of collectTypeScriptExports(target, visited)) exported.add(symbol);
  }

  for (const match of source.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    exported.add(match[1]);
  }

  return exported;
}

function resolveRelativeModule(fromFile, specifier) {
  if (!specifier.startsWith(".")) throw new Error(`only relative TypeScript barrel exports are supported: ${specifier}`);
  const base = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, ""));
  return resolveTypeScriptFile(base);
}

function resolveTypeScriptFile(candidate) {
  const options = [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, "index.ts"), path.join(candidate, "index.tsx")];
  for (const option of options) {
    if (fs.existsSync(option) && fs.statSync(option).isFile()) return path.resolve(option);
  }
  throw new Error(`TypeScript export target not found: ${candidate}`);
}

function validatePython(section) {
  validateSection(section, "python");
  const entrypoint = path.resolve(section.entrypoint);
  if (!fs.existsSync(entrypoint)) throw new Error(`Python entrypoint not found: ${section.entrypoint}`);
  const source = fs.readFileSync(entrypoint, "utf8");
  const match = source.match(/__all__\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) throw new Error(`Python entrypoint must define __all__: ${section.entrypoint}`);
  const exported = new Set([...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]));
  assertRequired("Python", section.required, exported);
}

function validateSection(section, label) {
  if (!section.entrypoint || typeof section.entrypoint !== "string") {
    throw new Error(`${label}.entrypoint must be a path`);
  }
  if (!Array.isArray(section.required) || section.required.length === 0) {
    throw new Error(`${label}.required must be a non-empty array`);
  }
  const unique = new Set(section.required);
  if (unique.size !== section.required.length) throw new Error(`${label}.required contains duplicate symbols`);
  for (const symbol of section.required) {
    if (!/^[A-Za-z_$][\w$]*$/.test(symbol)) throw new Error(`${label}: invalid symbol name ${symbol}`);
  }
}

function assertRequired(label, required, exported) {
  const missing = required.filter((symbol) => !exported.has(symbol));
  if (missing.length > 0) throw new Error(`${label} public API is missing required symbol(s): ${missing.join(", ")}`);
}
