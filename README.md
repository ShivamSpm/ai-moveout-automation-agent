# AI move-out automation agent

A personal agent that handles moving out of an apartment in San Francisco: it emails your landlord, reads their move-out documents, builds your checklist, books movers and cleaners, rents the truck, and sells or donates the things you're not keeping. You approve everything before it goes out.

Built at the Personal Agents hackathon in San Francisco (October 2026).

## Workflow

```
User ──email──▶ Landlord ──move-out docs──▶ Agent ──▶ Checklist (dated, from the lease)
                                              │
                                              ├──▶ Rents the U-Haul
                                              ├──▶ Contacts movers and cleaners
                                              └──▶ Sells or donates personal items
                                                   (Craigslist, Buy Nothing, Marketplace)
```

## Stack

Bland (voice), Vercel, Muse (vision), Supabase, OpenRouter (vision and negotiation), Apify, Gmail.

## Layout

| Folder | What's in it |
|---|---|
| `web/` | Next.js website: landing page, dashboard, items for sale |
