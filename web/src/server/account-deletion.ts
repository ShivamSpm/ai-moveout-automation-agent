import "server-only";
import type { ToolContext } from "./auth";
import { serviceClient } from "./supabase";

export async function removeAccountFiles(ctx: ToolContext) {
  const bucket = ctx.db.storage.from("move-files");
  // Collect all pages before deleting, so shrinking listings never skip offsets.
  async function visit(prefix: string): Promise<void> {
    const paths: string[] = [];
    const folders: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      for (const entry of data) (entry.id ? paths : folders).push(`${prefix}/${entry.name}`);
      if (data.length < 100) break;
    }
    for (const folder of folders) await visit(folder);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await bucket.remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
  }
  await visit(ctx.user.id);
}
export async function closeAccount(ctx: ToolContext, phrase: string) {
  if (phrase !== "DELETE MY ACCOUNT") throw new Error("Type DELETE MY ACCOUNT to confirm");
  // getClaims verifies the JWT, unlike decoding cookie contents. getUser verifies
  // identity again before the sole privileged operation below.
  const verified = await ctx.db.auth.getUser();
  if (verified.error || verified.data.user.id !== ctx.user.id) throw new Error("Sign in again to close your account");
  const claims = await ctx.db.auth.getClaims();
  const issued = claims.data?.claims.iat;
  if (claims.error || !issued || Date.now() / 1000 - issued > 600 || issued > Date.now() / 1000 + 30) throw new Error("Sign in again to close your account (within 10 minutes)");
  const households = await ctx.db.from("households").select("id").eq("owner_id", ctx.user.id);
  if (households.error) throw households.error;
  if (households.data.length) {
    const members = await ctx.db.from("household_members").select("id,expires_at")
      .in("household_id", households.data.map(h => h.id)).eq("status", "active").neq("user_id", ctx.user.id);
    if (members.error) throw members.error;
    if (members.data.some(m => !m.expires_at || new Date(m.expires_at).getTime() > Date.now())) throw new Error("Remove active household members before closing your account");
  }
  await removeAccountFiles(ctx);
  const revoked = await ctx.db.from("connector_tokens").update({ revoked_at: new Date().toISOString() }).eq("owner_id", ctx.user.id).is("revoked_at", null);
  if (revoked.error) throw revoked.error;
  const deleted = await serviceClient().auth.admin.deleteUser(verified.data.user.id);
  if (deleted.error) throw deleted.error;
  await ctx.db.auth.signOut();
}
