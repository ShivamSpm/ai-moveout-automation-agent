import { describe, expect, it } from "vitest";
import { CATEGORIES, INVENTORY_RESPONSE_FORMAT, InventoryItemSchema, InventoryResultSchema } from "@/contracts/inventory";

describe("INVENTORY_RESPONSE_FORMAT", () => {
  const schema = INVENTORY_RESPONSE_FORMAT.json_schema.schema as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const item = schema.properties.items.items;

  it("requires exactly the zod fields and closes every object", () => {
    expect([...schema.required].sort()).toEqual(Object.keys(InventoryResultSchema.shape).sort());
    expect([...item.required].sort()).toEqual(Object.keys(InventoryItemSchema.shape).sort());
    expect(schema.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
    const resale = item.properties.estimated_resale_usd.anyOf[0];
    expect(resale.additionalProperties).toBe(false);
    expect([...resale.required].sort()).toEqual(["high", "low"]);
  });

  it("keeps the category enum in sync and drops keywords strict providers reject", () => {
    expect(item.properties.category.enum).toEqual([...CATEGORIES]);
    const text = JSON.stringify(schema);
    for (const keyword of ['"$schema"', '"$ref"', '"minimum"', '"maximum"', '"minLength"', '"title"']) {
      expect(text).not.toContain(keyword);
    }
  });

  it("writes nullable fields as anyOf with null", () => {
    expect(item.properties.brand).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    expect(item.properties.estimated_resale_usd.anyOf[1]).toEqual({ type: "null" });
  });
});
