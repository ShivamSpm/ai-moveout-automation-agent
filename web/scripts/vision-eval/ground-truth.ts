import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { CategorySchema } from "@/contracts/inventory";
import { formatIssues } from "@/server/tools/inventory-prompt";

export class GroundTruthError extends Error {
  override name = "GroundTruthError";
}

export const GroundTruthItemSchema = z.strictObject({
  name: z.string().min(1),
  category: CategorySchema,
  quantity: z.number().int().min(1),
  salience: z.enum(["major", "minor"]),
});

export const GroundTruthImageSchema = z.strictObject({
  file: z.string().min(1),
  room: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  items: z.array(GroundTruthItemSchema),
});
export type GroundTruthImage = z.infer<typeof GroundTruthImageSchema>;

export const GroundTruthSchema = z
  .strictObject({ version: z.literal(1), images: z.array(GroundTruthImageSchema) })
  .superRefine((truth, ctx) => {
    const seen = new Set<string>();
    for (const image of truth.images) {
      if (seen.has(image.file)) ctx.addIssue({ code: "custom", message: `duplicate image entry: ${image.file}`, path: ["images"] });
      seen.add(image.file);
    }
  });
export type GroundTruth = z.infer<typeof GroundTruthSchema>;

export function parseGroundTruth(raw: unknown, source: string): GroundTruth {
  const parsed = GroundTruthSchema.safeParse(raw);
  if (!parsed.success) throw new GroundTruthError(`Invalid ground truth file ${source}:\n${formatIssues(parsed.error)}`);
  return parsed.data;
}

export function loadGroundTruth(path: string): GroundTruth {
  if (!existsSync(path)) throw new GroundTruthError(`Ground truth file not found: ${path}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new GroundTruthError(`Ground truth file ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseGroundTruth(raw, path);
}
