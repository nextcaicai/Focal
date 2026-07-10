# What's new in v0.2.5

## New Features

- Article translation overhaul: streaming translation with progressive updates, plus a display switcher for **Bilingual** and **Translation only** modes.
- Local RSS history import: pull available entries from the current feed window (imported as read, without AI processing). New and existing subscriptions can backfill history when the feed allows it.
- On-demand AI summary on the article page: generate a summary with your own key when you need it, without auto-running on full history.

## Improvements

- AI settings use clearer **LLM Model** / **Embedding Model** wording instead of BYOK jargon; provider empty states and error copy explain what each model is for.
- AI auto-processing (summary, tags, quality score) is **off by default** until you configure a model and opt in—Focal stays a quiet local RSS reader out of the box.
- AI settings layout and action descriptions updated so token usage and “new unread only” behavior are easier to understand.
- Discover navigation simplified by removing RSSHub-centric routes and related UI paths.
- Enrichment jobs respect automatic retry limits with failure tracking, so stuck or failing phases stop spinning forever.
- Mark-all-as-read for smart feeds handles date ranges and list limits more reliably.
- List item summaries better pick bilingual or generated descriptions and normalize markdown for line clamping.

## Bug Fixes

- Empty reading pane and empty list now show clearer placeholders (“Select an article to start reading”, “It's quiet here for now”).
- Translation display switcher spacing and labels cleaned up for a simpler toolbar.

## Thanks

Thanks for using v0.2.5 and sharing your feedback.
