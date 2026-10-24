@AGENTS.md

# Claude development entry point

Start with `START_HERE.md` and `docs/STATUS.md`. Keep the web app with chat as the first product
surface. The whiteboard is analyzed in `docs/WHITEBOARD.md`; user clarifications
are in `docs/DECISIONS.md`. Preserve both primary demo flows and the renter-serving
anti-eviction boundary. Integrate further decisions before treating proposals as final.

Development roles live in `.claude/agents/`. Their Codex equivalents live in
`.codex/agents/`. These build the product; they are not the renter-facing runtime.
Use them only when delegation is explicitly requested. Share results through
repository files and a concise handoff, not assumptions about another agent's memory.

Do not start background agents, connect accounts, or launch long-running services
merely because this file was loaded. Continue the user's actual requested task.
