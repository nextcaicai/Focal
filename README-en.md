<div align="center">
  <img src="./apps/desktop/layer/renderer/src/assets/focal-logo.png" alt="Focal Logo" width="88" height="88">

  <h1>Focal</h1>
  <p><strong>Focal - Your Feeds, Local First</strong></p>
  <p>A local RSS reader that learns more about your reading preferences over time.</p>
  <p><a href="./README.md">简体中文</a> | English</p>
</div>

## What Is Focal

Focal is forked from [RSSNext/Folo](https://github.com/RSSNext/Folo). Folo provides a mature foundation for subscriptions, timelines, cross-platform reading, and content ecosystems. Focal builds on top of that foundation and moves toward a more independent local-first direction, focusing on macOS desktop RSS reading, BYOK AI enhancement, and personal reading preference learning.

Focal currently defaults to local RSS mode: feeds, entries, unread state, AI-enhanced results, recommendation ranking, and integration settings mainly work around the local database and desktop runtime. Its goal is not to be another generic information stream, but a personal reading workspace that helps you filter, understand, and organize information.

## User-Facing Core Capabilities

### 1. Local RSS Subscriptions and Refresh

- Add RSS/Atom feeds by URL, with feed information and recent entries previewed before subscribing.
- Store subscriptions, entries, unread state, and AI results in a local database, reducing day-to-day dependence on remote sync state.
- Refresh local RSS feeds on startup and in the background, while preserving error status when a feed refresh fails.
- Keep only a small number of latest entries unread for new subscriptions by default, preventing historical backlog from flooding the timeline and reducing unnecessary BYOK AI usage.
- Organize content with feed categories, collapsible groups, batch unsubscribe, and content views.

### 2. Efficient Reading Timeline

- Smart Feeds such as Today, Unread, and Starred help you quickly jump into today's updates, all unread items, and saved content.
- Filter unread items, refresh timelines, mark all as read, switch entries with shortcuts, and browse by feed, category, or view.
- Switch between Latest and Recommended timelines: Latest follows publish time, while Recommended reorders items by your personal recommendation score.
- Use Readability mode, table of contents, code highlighting, reading typography, and toolbar customization for a more native desktop reading experience.

### 3. BYOK AI Reading Enhancement

- Configure your model API key in Settings > AI and use your preferred model service for AI capabilities. Recommended model: DeepSeek-v4-flash.
- Generate entry summaries, title/body translations, AI tags, and content quality scores.
- Choose bilingual or translation-only mode, and configure the output language for AI actions.
- Chat with the AI panel around the current article, feed, or timeline to ask follow-up questions, explain details, and organize what you are reading.
- Use timeline summaries to understand what happened across a batch of unread items before reading them one by one.

### 4. Recommendation Ranking That Learns Your Preferences

- Configure a model API key in Settings > AI to use this service. Recommended model: bge-m3.
- Focal combines content quality, publish time, unread/read/starred state, and personal interest signals into a recommendation score.
- Content quality scoring is based on AIRSS dimensions, focusing on information gain, depth, evidence, actionability, originality, and related signals.
- Embeddings and interest clusters semantically match new articles against your historical reading preferences, helping the Recommended timeline surface items you are more likely to value.
- Reading, starring, and marking items as not interested gradually become ranking feedback, helping the Recommended timeline move from cold-start freshness ranking toward a more personalized reading order.

### 5. Actions Automation Rules

- Create rules in Settings > Actions to automatically process all entries or entries that match specific conditions.
- Conditions include subscription status, view, feed title, category, site URL, feed URL, entry title, content, link, author, media count, and attachment duration.
- Actions include generating summaries, translating, enabling Readability, rescoring quality from Readability content, fetching source content, sending new-entry notifications, silencing, blocking, starring, rewrite rules, and webhooks.
- Save rules and apply them to existing entries, so repetitive information-processing workflows can happen during ingestion instead of manual reading.

### 6. Knowledge Organization and Third-Party Integrations

- Save entries to Obsidian and choose a local vault path.
- Use Markdown metadata and file path handling designed for knowledge base workflows.
- Built-in integrations for common knowledge bases such as Lark and Notion are planned.

## How Focal Differs From Folo

- **Local RSS reading**: shifts from cloud subscription sync first to local database, local refresh, and local state protection first.
- **BYOK AI pipeline**: summaries, translations, AI tags, quality scores, embeddings, and AI chat all run around the user's own model service.
- **Personalized AI RSS recommendation**: combines quality score, freshness, reading state, embedding interest matching, and negative interest signals into the Recommended timeline, while staying fully based on your own subscriptions so good content does not sink to the bottom.
- **macOS desktop reading experience**: optimizes high-frequency reading around two-column/multi-column layouts, shortcuts, draggable column widths, background refresh, and local caching.

## Tech Stack

- Monorepo: `pnpm` workspaces + Turbo
- Desktop/Web: Electron + Vite + React
- State: Jotai, Zustand, TanStack Query
- Database: Drizzle + SQLite
- UI: Tailwind CSS + Apple UIKit color tokens
- i18n: i18next

## Usage

### For End Users (Recommended)

Download the latest release directly from [GitHub Releases](https://github.com/nextcaicai/Focal/releases) (currently macOS only):

- **macOS**: Download the `.dmg` file and drag to install

Ready to use out of the box — no development environment setup required.

### For Developers

If you want to contribute or customize features, please refer to the "Local Development" section below.

## Local Development

Install dependencies:

```bash
pnpm install
```

Recommended browser mode for developing the desktop renderer:

```bash
cd apps/desktop
pnpm run dev:web
```

Run the full Electron desktop app:

```bash
cd apps/desktop
pnpm run dev:electron
```

Build the web version:

```bash
pnpm run build:web
```

Run checks in order before committing or merging:

```bash
pnpm run typecheck
pnpm run lint:fix
pnpm run test
```

## Contributing

Contributions are welcome around local RSS, BYOK AI, reading preference recommendations, Actions automation, knowledge base integrations, and the macOS desktop reading experience. Before contributing, please read the [Contributing Guide](./CONTRIBUTING.md) and follow the `AGENTS.md` conventions in each directory.

## Acknowledgments

Focal would not exist without the contributions of these excellent open-source projects:

- **[RSSNext/Folo](https://github.com/RSSNext/Folo)** — Focal is forked from Folo, inheriting its mature subscription management, timeline architecture, and cross-platform reader foundation.
- **[NetNewsWire](https://github.com/Ranchero-Software/NetNewsWire)** — The classic RSS reader for macOS, which deeply inspired Focal's local RSS processing and desktop reading experience design.
- **[Defuddle](https://github.com/kevinburke/defuddle)** — YouTube video transcript content extraction, providing technical support for Focal's clean reading mode.
- **[Simple Icons](https://github.com/simple-icons/simple-icons)** — High-quality brand icons used for feed and integration icon display.
- **[Lobehub](https://github.com/lobehub/lobe-chat)** — High-quality LLM brand icons used for model provider icon display.

## License

This project inherits the license constraints of upstream Folo and uses GNU Affero General Public License version 3.

Focal no longer distributes historical MingCute Pro assets from the `icons/mgc` directory. Current local icons live in `icons/focal` and are generated from redistributable open-source icons or Focal-owned assets.
