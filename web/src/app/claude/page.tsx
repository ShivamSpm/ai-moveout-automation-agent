import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Set up Claude · Vacate" };

const repository = "https://github.com/ShivamSpm/ai-moveout-automation-agent";
const commandStyle = "mt-3 block whitespace-pre-wrap break-words rounded-xl border border-line p-4 text-sm select-all";

export default function ClaudeSetupPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/dashboard" className="underline">← Back to Dashboard</Link>
      <h1 className="mt-6 font-display text-5xl">Set up Claude</h1>
      <p className="mt-4 text-muted">Add the Vacate marketplace, install the moving-assistant plugin, and connect your renter account to work with your saved move in Claude.</p>

      <section className="box-label mt-8 rounded-3xl p-6" aria-labelledby="claude-desktop">
        <h2 id="claude-desktop" className="font-display text-3xl">Claude web &amp; Desktop</h2>
        <p className="mt-3 text-sm text-muted">Requires a paid Claude plan with plugins enabled. Your organization may restrict custom marketplaces.</p>
        <ol className="mt-5 list-decimal space-y-5 pl-5">
          <li>Open <strong>Customize → Plugins</strong> in Claude. For Cowork, open the Cowork tab first.</li>
          <li>Choose <strong>Add → Add marketplace</strong>, then add this repository:
            <code className={commandStyle}>{repository}</code>
          </li>
          <li>Find <strong>moving-assistant</strong> in the <strong>vacate</strong> marketplace, review it, and choose <strong>Add</strong>.</li>
          <li>Connect the plugin’s <strong>Vacate</strong> connector when prompted. Sign in with the same renter account you use here and review the requested access.</li>
          <li>Enable Vacate in your conversation and ask: <q>Check my move and show me my checklist.</q></li>
        </ol>
        <p className="mt-5 text-sm text-muted">If the connector is not available after installation, follow the <a className="underline" href="https://github.com/ShivamSpm/ai-moveout-automation-agent/blob/main/docs/CONNECTORS.md">Vacate connector setup guide</a>.</p>
      </section>

      <section className="box-label mt-6 rounded-3xl p-6" aria-labelledby="claude-code">
        <h2 id="claude-code" className="font-display text-3xl">Claude Code</h2>
        <p className="mt-3 text-muted">Run these commands one at a time inside Claude Code.</p>
        <ol className="mt-5 list-decimal space-y-5 pl-5">
          <li>Add the marketplace:
            <code className={commandStyle}>/plugin marketplace add ShivamSpm/ai-moveout-automation-agent</code>
          </li>
          <li>Install the plugin, reviewing its details and choosing your install scope:
            <code className={commandStyle}>/plugin install moving-assistant@vacate</code>
          </li>
          <li>Reload or restart if prompted. Open the connection menu, select the Vacate server, and authenticate with your renter account:
            <code className={commandStyle}>/mcp</code>
          </li>
          <li>Check your saved move:
            <code className={commandStyle}>/moving-assistant:status</code>
          </li>
        </ol>
      </section>

      <p className="mt-6 text-sm text-muted">Setup is complete when Claude can read your saved move. You still review sends, calls, posts, and bookings before they happen. Facebook selling uses your own <Link href="/muse" className="underline">Muse setup</Link>.</p>
      <p className="mt-4 text-sm text-muted">Official instructions: <a className="underline" href="https://support.claude.com/en/articles/13837440-use-plugins-in-claude">Plugins in Claude</a> · <a className="underline" href="https://code.claude.com/docs/en/discover-plugins">Plugins in Claude Code</a></p>
    </div>
  );
}
