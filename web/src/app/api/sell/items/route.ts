import { z } from "zod";
import { AuthError, requireUser } from "@/server/auth";
import { ScopeError } from "@/server/domain/scope";
import { MarketplaceError } from "@/server/marketplace";
import { createSaleItem } from "@/server/selling/telegram-sales";

// POST /api/sell/items  multipart { photo, title, description, askUsd, floorUsd }
// Saves the item and drafts its Telegram listing for review. Nothing is posted.

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) return Response.json({ error: "Attach one photo as \"photo\"" }, { status: 400 });
    const result = await createSaleItem(
      ctx,
      { bytes: new Uint8Array(await photo.arrayBuffer()), mimeType: photo.type, name: photo.name },
      {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        askUsd: Number(form.get("askUsd")),
        floorUsd: Number(form.get("floorUsd")),
      },
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    const status =
      e instanceof z.ZodError ? 400 : e instanceof AuthError || e instanceof ScopeError || e instanceof MarketplaceError ? e.status : 500;
    const message = e instanceof z.ZodError ? z.prettifyError(e) : e instanceof Error ? e.message : "Request failed";
    if (status === 500) console.error(e);
    return Response.json({ error: message }, { status });
  }
}
