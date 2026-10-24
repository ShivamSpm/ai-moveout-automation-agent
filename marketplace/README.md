# Vacate plugin marketplace

Prepared locally; no repository or directory submission was created. The catalog
lives at `../.claude-plugin/marketplace.json`; its name is **vacate** and its plugin
is **moving-assistant 0.4.0**.

After the orchestrator reviews and publishes these files to the existing repository,
install in Claude Code:

```text
/plugin marketplace add ShivamSpm/ai-moveout-automation-agent
/plugin install moving-assistant@vacate
/mcp
```

Authenticate `vacate` with your own renter account. The plugin defaults to
`https://ai-moveout-automation-agent-tau.vercel.app/api/mcp`. To use a different
server, set `VACATE_MCP_URL` in the environment that launches Claude Code. The
configuration uses the documented `${VAR:-default}` expansion. Do not configure
a `vac_` executor token for Claude renter workflows. Avoid installing both the
plugin MCP server and a separate `claude mcp add` entry with the same endpoint.

New renters can install before creating a Vacate account. Run
`/moving-assistant:start` for signup/consent guidance, then
`/moving-assistant:muse` for Muse setup and optional browser assistance.
Passwords and connector credentials belong in their secure account/setup pages,
not in chat. The public walkthrough is `/claude`.

Commands: `/moving-assistant:status`, `/moving-assistant:checklist`,
`/moving-assistant:activity`, `/moving-assistant:open`. Focused skills explain
lease/checklist work, selling through Muse and draft-only landlord messages.
Every workflow shares links to the Vacate UI.

## Updates

Run `/plugin marketplace update vacate`, then
`/plugin update moving-assistant@vacate`; restart Claude Code or reload plugins
when prompted. Marketplace auto-update can be configured in `/plugin` →
Marketplaces. Maintainers must bump the plugin and catalog versions together.

## Future standalone repository

Do not create it as part of this work. When publication is separately authorized:

1. Create a repository owned by the Vacate team, with the chosen license.
2. Copy `.claude-plugin/marketplace.json` and the complete
   `plugins/moving-assistant/` subtree, preserving that relative directory layout.
   Copy this README and public connector setup documentation. Do not copy env
   files, Supabase configuration, user data or credentials.
3. Keep catalog name `vacate` or deliberately rename it and update install commands.
   The local source remains `./plugins/moving-assistant`; it is relative to the
   new repository root. No reference to another checkout is needed.
4. Validate both the plugin directory and new repository root with
   `claude plugin validate`. Review the diff for private data, then have the
   authorized publisher push it. Users add the new owner/repository and install
   `moving-assistant@vacate`. Remove the old catalog first if names conflict.
5. Treat Anthropic directory submission as a separate process. See
   [CONNECTORS.md](../docs/CONNECTORS.md); local validation does not establish
   directory acceptance, OAuth interoperability or hosted UI rendering.

## Official references

- [Marketplace structure and validation](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugin manifest, commands and MCP configuration](https://code.claude.com/docs/en/plugins-reference)
- [Install and manage plugins](https://code.claude.com/docs/en/discover-plugins)
- [MCP environment substitution and OAuth](https://code.claude.com/docs/en/mcp)
