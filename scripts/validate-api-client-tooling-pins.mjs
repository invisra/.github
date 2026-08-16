#!/usr/bin/env node
import fs from "node:fs";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const configPath = argument("--config", "shared-tooling-pins.json");
if (!fs.existsSync(configPath)) throw new Error(`tooling pin config not found: ${configPath}`);

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (config.schemaVersion !== 1) throw new Error("shared-tooling-pins.json schemaVersion must be 1");
if (!Array.isArray(config.pins) || config.pins.length === 0) {
  throw new Error("shared-tooling-pins.json pins must be non-empty");
}

const names = new Set();
for (const pin of config.pins) {
  if (!pin.name || !/^[a-z0-9][a-z0-9-]*$/.test(pin.name)) {
    throw new Error("each tooling pin requires a kebab-case name");
  }
  if (names.has(pin.name)) throw new Error(`duplicate tooling pin name: ${pin.name}`);
  names.add(pin.name);

  if (!/^[0-9a-f]{40}$/.test(pin.ref ?? "")) {
    throw new Error(`${pin.name}: ref must be a 40-character lowercase commit SHA`);
  }
  if (!Array.isArray(pin.files) || pin.files.length === 0) {
    throw new Error(`${pin.name}: files must be non-empty`);
  }

  for (const file of pin.files) {
    const descriptor = typeof file === "string" ? { path: file } : file;
    if (!descriptor?.path) throw new Error(`${pin.name}: each file requires a path`);
    if (!fs.existsSync(descriptor.path)) throw new Error(`${pin.name}: file not found: ${descriptor.path}`);

    const source = fs.readFileSync(descriptor.path, "utf8");
    const occurrences = countOccurrences(source, pin.ref);
    const expected = descriptor.occurrences;
    const minimum = descriptor.minOccurrences ?? 1;

    if (expected != null) {
      if (!Number.isInteger(expected) || expected < 1) {
        throw new Error(`${pin.name}: occurrences for ${descriptor.path} must be a positive integer`);
      }
      if (occurrences !== expected) {
        throw new Error(
          `${pin.name}: expected ${expected} occurrence(s) of ${pin.ref} in ${descriptor.path}, found ${occurrences}`,
        );
      }
    } else {
      if (!Number.isInteger(minimum) || minimum < 1) {
        throw new Error(`${pin.name}: minOccurrences for ${descriptor.path} must be a positive integer`);
      }
      if (occurrences < minimum) {
        throw new Error(
          `${pin.name}: expected at least ${minimum} occurrence(s) of ${pin.ref} in ${descriptor.path}, found ${occurrences}`,
        );
      }
    }
  }
}

console.log(`Validated ${config.pins.length} shared tooling pin(s) from ${configPath}.`);

function countOccurrences(source, value) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(value, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + value.length;
  }
}
