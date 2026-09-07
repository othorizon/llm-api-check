/**
 * Small JSON Schema validator covering the subset used by our probes:
 * type, properties, required, additionalProperties, items, enum, anyOf,
 * minimum/maximum, minItems/maxItems, const, nullable-by-anyOf.
 */
export interface SchemaError {
  path: string;
  message: string;
}

type Schema = Record<string, any>;

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
}

export function validateSchema(value: unknown, schema: Schema, path = "$"): SchemaError[] {
  const errors: SchemaError[] = [];
  if (!schema || typeof schema !== "object") return errors;
  if (schema.anyOf) {
    const anyOk = (schema.anyOf as Schema[]).some((s) => validateSchema(value, s, path).length === 0);
    if (!anyOk) errors.push({ path, message: "does not match any of anyOf" });
    return errors;
  }
  if (schema.oneOf) {
    const n = (schema.oneOf as Schema[]).filter((s) => validateSchema(value, s, path).length === 0).length;
    if (n !== 1) errors.push({ path, message: `matches ${n} of oneOf (expected exactly 1)` });
    return errors;
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push({ path, message: `expected const ${JSON.stringify(schema.const)}` });
  if (schema.enum && !schema.enum.some((e: unknown) => JSON.stringify(e) === JSON.stringify(value))) errors.push({ path, message: `expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}` });
  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push({ path, message: `expected type ${types.join("|")}, got ${typeOf(value)}` });
      return errors;
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) errors.push({ path, message: `${value} < minimum ${schema.minimum}` });
    if (typeof schema.maximum === "number" && value > schema.maximum) errors.push({ path, message: `${value} > maximum ${schema.maximum}` });
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errors.push({ path, message: `string shorter than ${schema.minLength}` });
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errors.push({ path, message: `string longer than ${schema.maxLength}` });
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) errors.push({ path, message: `does not match pattern ${schema.pattern}` });
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push({ path, message: `fewer than ${schema.minItems} items` });
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errors.push({ path, message: `more than ${schema.maxItems} items` });
    if (schema.items) value.forEach((item, i) => errors.push(...validateSchema(item, schema.items, `${path}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props: Record<string, Schema> = schema.properties ?? {};
    for (const key of schema.required ?? []) if (!(key in obj)) errors.push({ path: `${path}.${key}`, message: "missing required property" });
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) errors.push(...validateSchema(v, props[k], `${path}.${k}`));
      else if (schema.additionalProperties === false) errors.push({ path: `${path}.${k}`, message: "additional property not allowed" });
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") errors.push(...validateSchema(v, schema.additionalProperties, `${path}.${k}`));
    }
  }
  return errors;
}
