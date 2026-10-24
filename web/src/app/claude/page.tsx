import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Start with Claude · Vacate" };

const repository = "https://github.com/ShivamSpm/ai-moveout-automation-agent";
const commandStyle = "mt-3 block whitespace-pre-wrap break-words rounded-xl border border-line p-4 text-sm select-all";

export default function ClaudeSetupPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/" className="underline">← Back to Vacate</Link>
      <h1 className="mt-6 font-display text-5xl">Start your move with Claude</h1>
      <p className="mt-4 text-muted">No Vacate account yet? Start in Claude chat or Claude Code. Install the marketplace and plugin first, then let Claude guide you through creating an account and planning your move. You will need your own Claude access.</p>

      <nav aria-label="Claude setup steps" className="mt-6 flex flex-wrap gap-4 text-sm">
        <a className="underline" href="#claude-desktop">1. Claude chat</a>
        <a className="underline" href="#claude-code">1. Claude Code</a>
        <a className="underline" href="#connect-account">2. Create an account &amp; connect</a>
        <a className="underline" href="#first-move">3. Start your move</a>
        <a className="underline" href="#muse-from-claude">4. Set up Muse</a>
      </nav>

      <section className="box-label mt-8 rounded-3xl p-6" aria-labelledby="claude-desktop">
        <h2 id="claude-desktop" className="font-display text-3xl">Claude web &amp; Desktop</h2>
        <p className="mt-3 text-sm text-muted">Requires a paid Claude plan with plugins enabled. Your organization may restrict custom marketplaces.</p>
        <ol className="mt-5 list-decimal space-y-5 pl-5">
          <li>Open <strong>Customize → Plugins</strong> in Claude. For Cowork, open the Cowork tab first.</li>
          <li>Choose <strong>Add → Add marketplace</strong>, then add this repository:
            <code className={commandStyle}>{repository}</code>
          </li>
          <li>Find <strong>moving-assistant</strong> in the <strong>vacate</strong> marketplace, review it, and choose <strong>Add</strong>.</li>
          <li>Start a conversation with the plugin enabled and paste this prompt:
            <code className={commandStyle}>I’m new to Vacate and don’t have an account. Help me create one, connect it to Claude, and start planning my voluntary move. Guide me one step at a time.</code>
          </li>
          <li>When Claude asks you to connect Vacate, follow <a href="#connect-account" className="underline">Create an account &amp; connect</a> below.</li>
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
          <li>Reload or restart if prompted, then ask the plugin to guide you from the beginning:
            <code className={commandStyle}>/moving-assistant:start</code>
          </li>
          <li>Open the connection menu and select the Vacate server. Follow the account creation steps below:
            <code className={commandStyle}>/mcp</code>
          </li>
        </ol>
      </section>

      <section id="connect-account" className="box-label mt-6 scroll-mt-6 rounded-3xl p-6" aria-labelledby="account-heading">
        <h2 id="account-heading" className="font-display text-3xl">Create an account &amp; connect</h2>
        <p className="mt-3 text-muted">Installing the plugin does not require a Vacate account. Connecting your saved move does.</p>
        <ol className="mt-5 list-decimal space-y-4 pl-5">
          <li>Choose <strong>Connect</strong> or <strong>Sign in</strong> for Vacate in Claude. In Claude Code, use <code>/mcp</code> and select the Vacate server.</li>
          <li>On the Vacate sign-in page that opens, enter your email and a password of at least eight characters, then choose <strong>Create account</strong>. Already registered? Choose <strong>Sign in with email</strong>.</li>
          <li>If asked, confirm your email using the link in your inbox, then sign in if needed. If the connection request expires while you confirm, return to Claude and connect Vacate again.</li>
          <li>Review the <strong>Connect an assistant</strong> screen and choose <strong>Allow</strong> when you are ready. Return to Claude and enable the Vacate connector in your conversation.</li>
        </ol>
        <p className="mt-4 text-sm text-muted">Enter your password and confirmation codes only on the sign-up/sign-in page, never in chat. Claude guides you; you create the account and authorize access yourself.</p>
        <Link href="/login?next=%2Fclaude%23connect-account" className="tape mt-5 inline-flex min-h-11 items-center rounded-xl px-5 py-3 font-semibold">Open Vacate account creation</Link>
        <p className="mt-3 text-sm text-muted">If you use this link first, return to Claude afterward and connect Vacate. A name-only guest move on this browser is separate from creating an email account for Claude.</p>
      </section>

      <section id="first-move" className="box-label mt-6 scroll-mt-6 rounded-3xl p-6" aria-labelledby="move-heading">
        <h2 id="move-heading" className="font-display text-3xl">Start your first move</h2>
        <p className="mt-3 text-muted">Back in Claude, send:</p>
        <code className={commandStyle}>I’ve connected Vacate. Check my move, help me add my move details and lease, then walk me through my checklist. Ask me about anything that is missing.</code>
        <p className="mt-4 text-muted">Claude can check your move and guide your next steps. Tell Claude your name, address and dates to save through Vacate’s tools. Use the Documents link it provides to upload your lease. Return to Claude to review saved lease findings, plan your checklist, and prepare items to sell.</p>
        <p className="mt-4 text-sm text-muted">In Claude Code, you can also run <code>/moving-assistant:status</code>. A new account starts with an empty move; lease findings appear after you upload and read a lease.</p>
        <Link className="mt-4 inline-block underline" href="/start">Add move details in Vacate</Link>
      </section>

      <section className="box-label mt-6 rounded-3xl p-6" aria-labelledby="telegram-heading">
        <h2 id="telegram-heading" className="font-display text-3xl">Sell on Telegram from Claude</h2>
        <p className="mt-3 text-muted">Ask Claude to help sell an item on Telegram, or run <code>/moving-assistant:telegram</code> in Claude Code. Connect your Telegram account and group once using the private link Claude provides.</p>
        <p className="mt-3 text-muted">Claude uses your saved inventory and attached photos to draft the listing. Review its exact destination, bot account, photo and caption in chat, then approve publication. No listing text needs to be copied into Vacate or Telegram.</p>
        <p className="mt-3 text-muted">Ask Claude to check buyer messages, draft replies and arrange pickup. For listings prepared through these Claude tools, each reply and pickup confirmation waits for your review, and prices do not change automatically.</p>
        <p className="mt-3 text-sm text-muted">Telegram must be configured on Vacate. Live delivery depends on the bot’s access to your selected destination. Older listings created through the website retain their existing negotiation behavior.</p>
      </section>

      <section id="muse-from-claude" className="box-label mt-6 scroll-mt-6 rounded-3xl p-6" aria-labelledby="muse-heading">
        <h2 id="muse-heading" className="font-display text-3xl">Coordinate Muse from Claude</h2>
        <p className="mt-3 text-muted">Claude can help prepare your Marketplace listings, review each action with you, and check the results Muse reports to your Vacate account.</p>
        <code className={commandStyle}>Help me connect my own Muse account to Vacate, prepare a Marketplace listing for an item I own, and check its progress. Tell me when I need to sign in or approve something.</code>
        <p className="mt-4 text-sm text-muted">In Claude Code, run <code>/moving-assistant:muse</code>. Existing plugin users should update the vacate marketplace and moving-assistant plugin to version 0.5.0 or later.</p>
        <h3 className="mt-6 text-lg font-semibold">With Claude Code and Chrome</h3>
        <p className="mt-2 text-muted">Install the official Claude in Chrome extension and start Claude Code with <code>claude --chrome</code>. Use <code>/chrome</code> to check the connection. With your site permissions, Claude can help navigate Muse’s visible website and follow the conversation while you stay in your Claude Code workflow.</p>
        <p className="mt-3 text-sm text-muted">This browser-assisted Muse workflow has not yet been verified end to end. You still complete sign-in, account connection, and Muse’s publish approvals yourself. Browser tools do not grant Facebook access.</p>
        <h3 className="mt-6 text-lg font-semibold">Connect the same Vacate account</h3>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          <li>Sign into your own Muse account with the Facebook profile you want to use.</li>
          <li>Open <Link href="/muse" className="underline">Muse setup in Vacate</Link> with the same Vacate account connected to Claude. Create a connector token there and add Vacate as a custom connector in Muse using the displayed endpoint and token. Keep the token in the connector settings, out of chat.</li>
          <li>Ask Muse to check Vacate for approved work. Claude can inspect connector activity, but a token’s existence or past use does not prove that Facebook posting is available.</li>
          <li>Review a listing in Claude. After approval, Claude retrieves a task-specific handoff through Vacate and can enter it directly into Muse using an available browser session—no prompt copying needed. Complete Muse’s own approval prompt, then ask Claude to check the result.</li>
        </ol>
        <h3 className="mt-6 text-lg font-semibold">Claude chat and Facebook posts</h3>
        <p className="mt-2 text-muted">Without browser tools, Claude chat can prepare listings and read reported activity, but you open Muse to connect and start the work. The Vacate connector cannot directly control personal Muse conversations.</p>
        <p className="mt-3 text-muted">Marketplace listings, buyer replies, and pickup confirmations use Vacate’s reviewed work queue. General Facebook profile or group posts can be drafted in Claude, but publishing them through Vacate is not supported yet.</p>
        <a className="mt-4 inline-block text-sm underline" href="https://code.claude.com/docs/en/chrome">Official Claude Code browser setup</a>
      </section>

      <p className="mt-6 text-sm text-muted">Setup is complete when Claude can read your saved move. You still review sends, calls, posts, and bookings before they happen. Facebook selling uses your own <Link href="/muse" className="underline">Muse setup</Link>.</p>
      <p className="mt-4 text-sm text-muted">Official instructions: <a className="underline" href="https://support.claude.com/en/articles/13837440-use-plugins-in-claude">Plugins in Claude</a> · <a className="underline" href="https://code.claude.com/docs/en/discover-plugins">Plugins in Claude Code</a></p>
    </div>
  );
}
