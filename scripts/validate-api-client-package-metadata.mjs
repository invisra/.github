#!/usr/bin/env node
import fs from "node:fs";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const configPath = argument("--config", "package-metadata.config.json");
if (!fs.existsSync(configPath)) throw new Error(`package metadata config not found: ${configPath}`);

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const packageJsonPath = config.typescript.packageJson;
const pyprojectPath = config.python.pyproject;

if (!fs.existsSync(packageJsonPath)) throw new Error(`package.json not found: ${packageJsonPath}`);
if (!fs.existsSync(pyprojectPath)) throw new Error(`pyproject.toml not found: ${pyprojectPath}`);

const npm = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const pyproject = fs.readFileSync(pyprojectPath, "utf8");

const python = {
  name: tomlString(pyproject, "name"),
  version: tomlString(pyproject, "version"),
  license: tomlLicense(pyproject),
  repository: tomlProjectUrl(pyproject, "Repository"),
};

const expectedRepository = `https://github.com/${config.repository}`;
const npmRepository = normalizeRepositoryUrl(
  typeof npm.repository === "string" ? npm.repository : npm.repository?.url,
);

assertEqual("npm package name", npm.name, config.typescript.name);
assertEqual("Python package name", python.name, config.python.name);
assertEqual("package version", npm.version, python.version);
assertEqual("npm license", npm.license, config.license);
assertEqual("Python license", python.license, config.license);
assertEqual("npm repository", npmRepository, expectedRepository);
assertEqual("Python repository", normalizeRepositoryUrl(python.repository), expectedRepository);

if (npm.publishConfig?.access !== "public") {
  throw new Error(`npm publishConfig.access must be "public"; got ${JSON.stringify(npm.publishConfig?.access)}`);
}

console.log(
  `Validated package metadata: npm=${npm.name}@${npm.version}, python=${python.name}@${python.version}, repository=${config.repository}.`,
);

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function tomlString(source, key) {
  const match = source.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]+)"`, "m"));
  if (!match) throw new Error(`pyproject.toml is missing string field ${key}`);
  return match[1];
}

function tomlLicense(source) {
  const stringMatch = source.match(/^license\s*=\s*"([^"]+)"/m);
  if (stringMatch) return stringMatch[1];
  const tableMatch = source.match(/^license\s*=\s*\{[^}]*text\s*=\s*"([^"]+)"[^}]*\}/m);
  if (tableMatch) return tableMatch[1];
  throw new Error("pyproject.toml is missing a supported license value");
}

function tomlProjectUrl(source, key) {
  const section = source.match(/^\[project\.urls\]\s*$([\s\S]*?)(?=^\[|\Z)/m)?.[1];
  if (!section) throw new Error("pyproject.toml is missing [project.urls]");
  const quoted = key.replaceAll('"', '\\"');
  const match = section.match(new RegExp(`^(?:"${quoted}"|${escapeRegExp(key)})\\s*=\\s*"([^"]+)"`, "m"));
  if (!match) throw new Error(`pyproject.toml [project.urls] is missing ${key}`);
  return match[1];
}

function normalizeRepositoryUrl(value) {
  if (typeof value !== "string" || value.length === 0) return value;
  return value
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
}
