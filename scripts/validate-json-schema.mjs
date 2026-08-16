#!/usr/bin/env node
import fs from "node:fs";

const schemaPath = argument("--schema");
const instancePath = argument("--instance");
if (!schemaPath || !instancePath) {
  throw new Error("usage: validate-json-schema.mjs --schema <schema.json> --instance <instance.json>");
}
if (!fs.existsSync(schemaPath)) throw new Error(`schema not found: ${schemaPath}`);
if (!fs.existsSync(instancePath)) throw new Error(`instance not found: ${instancePath}`);

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const instance = JSON.parse(fs.readFileSync(instancePath, "utf8"));
const errors = [];
validate(schema, instance, "$", errors);
if (errors.length > 0) {
  throw new Error(`schema validation failed for ${instancePath}:\n- ${errors.join("\n- ")}`);
}
console.log(`Validated ${instancePath} against ${schemaPath}.`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validate(schemaNode, value, location, errors) {
  if (schemaNode === true) return;
  if (schemaNode === false) {
    errors.push(`${location}: value is not allowed`);
    return;
  }

  if (schemaNode.const !== undefined && !deepEqual(value, schemaNode.const)) {
    errors.push(`${location}: must equal ${JSON.stringify(schemaNode.const)}`);
  }
  if (schemaNode.enum && !schemaNode.enum.some((candidate) => deepEqual(candidate, value))) {
    errors.push(`${location}: must be one of ${schemaNode.enum.map(JSON.stringify).join(", ")}`);
  }
  if (schemaNode.anyOf) {
    const valid = schemaNode.anyOf.some((candidate) => validates(candidate, value));
    if (!valid) errors.push(`${location}: must match at least one anyOf schema`);
    return;
  }
  if (schemaNode.oneOf) {
    const matches = schemaNode.oneOf.filter((candidate) => validates(candidate, value)).length;
    if (matches !== 1) errors.push(`${location}: must match exactly one oneOf schema`);
    return;
  }
  if (schemaNode.allOf) {
    for (const candidate of schemaNode.allOf) validate(candidate, value, location, errors);
  }

  const types = schemaNode.type == null ? [] : Array.isArray(schemaNode.type) ? schemaNode.type : [schemaNode.type];
  if (types.length > 0 && !types.some((type) => matchesType(type, value))) {
    errors.push(`${location}: expected ${types.join(" or ")}, got ${typeName(value)}`);
    return;
  }

  if (typeof value === "string") {
    if (schemaNode.minLength != null && value.length < schemaNode.minLength) {
      errors.push(`${location}: must contain at least ${schemaNode.minLength} character(s)`);
    }
    if (schemaNode.pattern != null && !new RegExp(schemaNode.pattern).test(value)) {
      errors.push(`${location}: must match /${schemaNode.pattern}/`);
    }
  }

  if (typeof value === "number") {
    if (schemaNode.minimum != null && value < schemaNode.minimum) errors.push(`${location}: must be >= ${schemaNode.minimum}`);
  }

  if (Array.isArray(value)) {
    if (schemaNode.minItems != null && value.length < schemaNode.minItems) {
      errors.push(`${location}: must contain at least ${schemaNode.minItems} item(s)`);
    }
    if (schemaNode.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) errors.push(`${location}: items must be unique`);
    }
    if (schemaNode.items) value.forEach((item, index) => validate(schemaNode.items, item, `${location}[${index}]`, errors));
  }

  if (isObject(value)) {
    for (const required of schemaNode.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${location}: missing required property ${required}`);
    }
    const properties = schemaNode.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) {
        validate(properties[key], child, `${location}.${key}`, errors);
      } else if (schemaNode.additionalProperties === false) {
        errors.push(`${location}: unexpected property ${key}`);
      } else if (isObject(schemaNode.additionalProperties)) {
        validate(schemaNode.additionalProperties, child, `${location}.${key}`, errors);
      }
    }
  }
}

function validates(schema, value) {
  const errors = [];
  validate(schema, value, "$", errors);
  return errors.length === 0;
}

function matchesType(type, value) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
