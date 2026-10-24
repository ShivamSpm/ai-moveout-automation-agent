import { z } from "zod";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonSchema = { [key: string]: Json };

// Keywords some providers' strict structured-output modes reject; zod still enforces the bounds
// when the reply is parsed, so dropping them here loosens nothing.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$defs",
  "definitions",
  "title",
  "default",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
]);

function isRecord(node: Json): node is { [key: string]: Json } {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

function reduce(node: Json): Json {
  if (Array.isArray(node)) return node.map(reduce);
  if (!isRecord(node)) return node;
  const entries = Object.entries(node)
    .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
    .map(([key, value]): [string, Json] => [key, key === "properties" ? reduceProperties(value) : reduce(value)]);
  const reduced: { [key: string]: Json } = Object.fromEntries(entries);
  const type = reduced.type;
  // The schema this replaces was verified live with nullable fields written as anyOf [X, null];
  // keep that shape rather than the type-array form zod emits.
  if (Array.isArray(type) && type.length === 2 && type.includes("null")) {
    const { type: _omit, ...rest } = reduced;
    void _omit;
    const other = type.find((t) => t !== "null") as Json;
    return { anyOf: [{ ...rest, type: other }, { type: "null" }] };
  }
  if (reduced.type === "object" && isRecord(reduced.properties ?? null)) {
    return { ...reduced, additionalProperties: false, required: Object.keys(reduced.properties as object) };
  }
  return reduced;
}

function reduceProperties(properties: Json): Json {
  // Property names are data, not keywords: a field called "title" must survive the reduction.
  if (!isRecord(properties)) return properties;
  return Object.fromEntries(Object.entries(properties).map(([name, schema]) => [name, reduce(schema)]));
}

/** JSON Schema for a zod schema, with every object closed and fully required. */
export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  const generated = z.toJSONSchema(schema, { target: "draft-7", io: "output", unrepresentable: "throw" });
  return reduce(generated as Json) as JsonSchema;
}

export interface JsonSchemaResponseFormat {
  type: "json_schema";
  json_schema: { name: string; strict: true; schema: JsonSchema };
}

export function jsonSchemaResponseFormat(name: string, schema: z.ZodType): JsonSchemaResponseFormat {
  return { type: "json_schema", json_schema: { name, strict: true, schema: strictJsonSchema(schema) } };
}
