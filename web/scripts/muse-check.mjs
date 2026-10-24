// Muse Code SDK capability check: spawn `muse serve`, complete the MSP
// handshake, start a session in an empty scratch workspace, run one turn and
// shut down. Prints a JSON report. Does not touch Facebook or any account
// beyond the Muse Code sign-in the host already has.

import { existsSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnMspConnection } from "@muse-code/sdk";

const onPath = (process.env.PATH ?? "").split(path.delimiter).map((d) => path.join(d, "muse")).find(existsSync);
const museBin = [process.env.MUSE_BIN, path.join(homedir(), ".local/bin/muse"), onPath].find((c) => c && existsSync(c));
if (!museBin) {
  console.log(JSON.stringify({ ok: false, error: "muse host not installed", hint: "curl https://dev.meta.ai/install.sh | bash, then run `muse` once to sign in" }, null, 2));
  process.exit(1);
}
const workspaceRoot = mkdtempSync(path.join(tmpdir(), "muse-check-"));
const report = { museBin, workspaceRoot, steps: [], notifications: [] };
const stderr = [];
const step = (name, detail = {}) => report.steps.push({ name, at: new Date().toISOString(), ...detail });

const timeout = (ms, label) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms));

let msp;
try {
  const handshake = spawnMspConnection({
    command: museBin,
    args: ["serve"],
    cwd: workspaceRoot,
    onStderr: (chunk) => stderr.push(chunk),
  });
  msp = await Promise.race([
    handshake.initialize({ clientInfo: { name: "vacate-muse-check", version: "0.1.0" } }),
    timeout(30_000, "handshake"),
  ]);
  step("handshake");

  let finalText = "";
  let resolveTurn;
  const turnDone = new Promise((r) => (resolveTurn = r));
  msp.connection.onNotification((n) => {
    report.notifications.push(n.method);
    const p = n.params ?? {};
    if (n.method === "item/completed" && typeof p.item?.text === "string") finalText = p.item.text;
    if (n.method === "approval/requested") step("approval_requested_not_answered", { approvalId: p.approvalId });
    if (n.method === "turn/completed") resolveTurn(p);
  });

  const started = await msp.connection.command("session/start", { workspaceRoot });
  const sessionId = started.session.sessionId;
  step("session_started", { sessionId });

  const ack = await msp.connection.command("turn/start", {
    sessionId,
    input: [{ type: "text", text: "Reply with the single word: hello" }],
  });
  step("turn_accepted", { status: ack.status, turnId: ack.turnId });

  const completed = await Promise.race([turnDone, timeout(90_000, "turn")]);
  step("turn_completed", { terminal: completed.terminal, error: completed.error?.kind, finalText });
  report.ok = completed.terminal === "completed" || /hello/i.test(finalText);
} catch (e) {
  report.ok = false;
  report.error = e instanceof Error ? e.message : String(e);
  if (/authRequired/.test(report.error)) report.hint = "Sign in: run `muse` once, or set META_API_KEY";
} finally {
  if (msp) report.exit = await msp.close().catch((e) => ({ error: String(e) }));
  report.stderrTail = stderr.join("").split("\n").slice(-8).join("\n");
  report.notifications = [...new Set(report.notifications)];
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
