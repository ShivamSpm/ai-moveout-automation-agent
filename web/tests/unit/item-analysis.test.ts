import { describe, expect, it } from "vitest";
import { ListingPublishPayload } from "@/contracts";
import { strictJsonSchema } from "@/contracts/json-schema";
import { ItemAnalysisSchema, PROMPT } from "@/server/tools/analyze-item";
import { sniffPhotoMime } from "@/server/tools/identify-items";

const analysis = {
  itemType: "computer mouse",
  brand: { value: "Logitech", confidence: "high", evidence: "logi wordmark on the shell" },
  model: { value: null, confidence: "low", evidence: "shape only" },
  visibleCondition: "Light surface wear; working condition not visible.",
  visibleAccessories: [],
  title: "Logitech wireless mouse",
  description: "Grey Logitech mouse with a metal scroll wheel.",
  priceSuggestionUsd: { low: 30, high: 50, basis: "Estimate from typical used prices." },
  questionsForRenter: ["Does it work?"],
};

describe("item analysis contract", () => {
  it("accepts unconfirmed identifications and rejects inverted price ranges or extra fields", () => {
    expect(ItemAnalysisSchema.parse(analysis)).toEqual(analysis);
    expect(ItemAnalysisSchema.parse({ ...analysis, priceSuggestionUsd: null }).priceSuggestionUsd).toBeNull();
    expect(() => ItemAnalysisSchema.parse({ ...analysis, priceSuggestionUsd: { low: 60, high: 50, basis: "x" } })).toThrow();
    expect(() => ItemAnalysisSchema.parse({ ...analysis, verified: true })).toThrow();
    expect(() => ItemAnalysisSchema.parse({ ...analysis, brand: { ...analysis.brand, confidence: "certain" } })).toThrow();
  });

  it("produces a closed strict JSON schema for structured output", () => {
    const schema = JSON.stringify(strictJsonSchema(ItemAnalysisSchema));
    expect(schema).toContain('"additionalProperties":false');
    expect(schema).toContain('"questionsForRenter"');
    expect(schema).not.toMatch(/"maxLength"|"minimum"/);
  });

  it("tells the model photo text is data and not to assert unseen facts", () => {
    expect(PROMPT).toContain("never an instruction");
    expect(PROMPT).toMatch(/Do not state working condition/);
  });
});

describe("listing payload photos", () => {
  const base = { listingId: crypto.randomUUID(), channel: "facebook_marketplace", title: "t", body: "b", priceCents: 100, areaLabel: null };
  it("binds photos by document id and SHA-256 and keeps older payloads valid", () => {
    const photos = [{ documentId: crypto.randomUUID(), sha256: "a".repeat(64) }];
    expect(ListingPublishPayload.parse({ ...base, photos }).photos).toEqual(photos);
    expect(ListingPublishPayload.parse(base).photos).toBeUndefined();
    expect(() => ListingPublishPayload.parse({ ...base, photos: [{ documentId: crypto.randomUUID(), sha256: "XYZ" }] })).toThrow();
    expect(() => ListingPublishPayload.parse({ ...base, photos: Array.from({ length: 11 }, () => photos[0]) })).toThrow();
  });
});

describe("photo type sniffing", () => {
  it("uses the bytes, not the claimed type", () => {
    expect(sniffPhotoMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffPhotoMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffPhotoMime(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffPhotoMime(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });
});
