# What's new in v0.2.6

## New Features

- **Library search**: New sidebar search (alongside Today / Unread / Starred) finds articles across all subscriptions. Results rank by relevance, time, and quality score, and match translated titles when available.
- **Semantic search**: With Embedding enabled, search combines keyword matching and vector similarity—so synonyms and cross-language phrasing can still surface. The search header shows semantic index progress. Full-library keyword search always works without vectors.
- **AI tag taxonomy upgrade (genre / domain / topic)**: Tags now follow content type, domain, and topic axes. Legacy labels are upgraded offline via a mapping table so the whole library is not force re-tagged with the LLM.

## Improvements

- Keyword My Topics can match by semantic similarity when embeddings exist, not only exact title substrings.
- Sidebar wording unified from “Find” to “Browse” for clearer navigation.
- Empty subscription state opens the Discover page instead of a temporary quick-add modal.
- **Semantic index defaults to unread only**: Embeddings are built for unread entries (aligned with BYOK). Progress and “Rebuild unread index” copy match that scope; read history remains keyword-searchable.
- **Batch embedding**: Semantic indexing can process entries in batches—faster progress and less overhead while building the index.
- **Faster startup**: Core data loads in stages so the main UI becomes usable sooner after launch.
- **Clearer search results**: The header shows the real hit count; the result list is capped for smoother browsing in large libraries.
- **Smarter short / entity queries**: Names and short product-like queries prefer keyword matching and skip unnecessary vector lookups.
- **Empty-state copy**: Search with no hits shows “No matching content”; empty Today / All Unread shows “It's quiet here for now” instead of the incorrect “Zero Unread” celebration state.
- Event listeners and hook dependencies cleaned up across the renderer for more stable UI and fewer redundant re-renders.

## Bug Fixes

- Embedding job queue deduplication: the same article is no longer enqueued many times, which inflated the “Queued” count, wasted work, and could make the app feel sluggish.
- Library search session state simplified (unused scope/sort fields removed) to avoid leftover session quirks.
- Search and list-related localization strings completed and aligned (en / zh-CN / zh-TW / ja / fr-FR).

## Thanks

Thanks for using v0.2.6 and sharing feedback—library search and the semantic index improve most with real libraries like yours.
