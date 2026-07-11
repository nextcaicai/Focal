# What's new in v0.2.6

## New Features

- **Library search**: New sidebar search (alongside Today / Unread / Starred) finds articles across all subscriptions. Results rank by relevance, time, and quality score, and match translated titles when available.
- **Semantic search**: With Embedding enabled, search combines keyword matching and vector similarity—so synonyms and cross-language phrasing can still surface. The search header shows semantic index progress.
- **Semantic index includes read history**: Embeddings are built for read and historical entries as well as unread (separate from LLM summary/tagging—no extra chat-model spend for indexing).
- **AI tag taxonomy upgrade (genre / domain / topic)**: Tags now follow content type, domain, and topic axes. Legacy labels are upgraded offline via a mapping table so the whole library is not force re-tagged with the LLM.

## Improvements

- Keyword My Topics can match by semantic similarity when embeddings exist, not only exact title substrings.
- Sidebar wording unified from “Find” to “Browse” for clearer navigation.
- Empty subscription state opens the Discover page instead of a temporary quick-add modal.
- Embedding processing status and rebuild copy cover all embeddable entries (including read), with clearer progress.
- Event listeners and hook dependencies cleaned up across the renderer for more stable UI and fewer redundant re-renders.

## Bug Fixes

- Library search session state simplified (unused scope/sort fields removed) to avoid leftover session quirks.
- Search and list-related localization strings completed and aligned (en / zh-CN / zh-TW / ja / fr-FR).

## Thanks

Thanks for using v0.2.6 and sharing feedback—library search and the semantic index improve most with real libraries like yours.
