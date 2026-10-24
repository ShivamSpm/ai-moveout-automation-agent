import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { ToolContext } from "./auth";
export const inviteHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function createHousehold(ctx: ToolContext, name: string) {
  const result = await ctx.db.from("households").insert({ name: z.string().trim().min(1).max(100).parse(name) }).select().single();
  if (result.error) throw result.error;
  return result.data;
}
export async function inviteMember(ctx: ToolContext, householdId: string, email: string) {
  const token = randomBytes(32).toString("hex");
  const result = await ctx.db.rpc("invite_household_member", { h: z.uuid().parse(householdId),
    email: z.email().parse(email.trim().toLowerCase()), token_hash: inviteHash(token) });
  if (result.error) throw result.error;
  return token;
}
export async function acceptInvite(ctx: ToolContext, token: string) {
  z.string().regex(/^[0-9a-f]{64}$/).parse(token);
  const result = await ctx.db.rpc("accept_household_invite", { token_hash: inviteHash(token) });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function revokeMember(ctx: ToolContext, memberId: string) {
  const result = await ctx.db.rpc("revoke_household_member", { member_id: z.uuid().parse(memberId) });
  if (result.error) throw result.error;
}
