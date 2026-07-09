# Default Two-Column Layout Exploration

Date: 2026-07-09

## Context

We explored a desktop layout idea for Focal:

- Default open state: show only the subscription sidebar and the entry timeline.
- The entry timeline expands into the space normally used by the reader.
- The reader opens on the right only after the user selects an entry.

The product goal was reasonable: when the app first opens, users are usually
triaging entries, not deep-reading one article. Hiding the reader until needed
could make the initial screen feel calmer and give the timeline more room for
summary, tags, rank score, and source metadata.

## Prototypes Tried

Two throwaway high-fidelity prototypes were created under
`design-demos/focal-two-column-default/` and then removed after review.

### 1. Expanded Timeline With Responsive Cards

The first prototype used the full middle canvas as a responsive card/grid
timeline. It technically filled the large screen well, but it mixed two separate
ideas:

- page structure: two-column default vs. three-column reading state
- timeline presentation: grid/cards vs. list

That made the design ambiguous. It looked like two layout modes existed at the
same time instead of a single default state.

### 2. Expanded Timeline With Single List

The second prototype removed the internal grid and kept a single expanded list.
This clarified the page structure, but revealed the stronger product problem:
on a large desktop screen, the middle column becomes too long and too wide.

The list items stretch horizontally, reading lines become oversized, and the
screen loses density. Instead of improving triage, the default state makes
scanning feel weaker.

## Decision

Do **not** ship the explored default two-column layout as-is.

The core issue is not implementation complexity. The existing layout code already
has a technical seam close to this behavior: when no right reader is visible,
the entry column can flex wider; when a reader is open, the entry column can
shrink. The issue is product fit on large screens.

On wide desktop windows, a fully expanded single timeline is a poor use of
space. It creates long rows, weak scan rhythm, and too much empty horizontal
surface. A responsive grid avoids the long-row issue, but changes the timeline
reading model and introduces a second concept that competes with the layout
change itself.

## Implications

- Do not repeat a prototype whose only idea is "make the middle column fill all
  remaining width until an entry is selected."
- Do not solve this by simply switching the expanded timeline to a grid; that
  is a separate timeline presentation decision and should be evaluated on its
  own.
- Do not treat this as a pure CSS/layout problem. The failure mode is triage
  quality on large screens, not whether the columns can be resized.

## Better Directions To Explore Later

If we revisit the default-open experience, explore designs that keep the
timeline at a readable scanning width while using the remaining space for
something with product value:

- a lightweight empty reader/insight panel with today summary, topic clusters,
  or "why recommended" context
- a centered or max-width timeline with intentional side whitespace, if the app
  wants a calmer reading queue rather than maximum density
- a preview-on-hover or peek panel that does not permanently open the reader
- a dedicated triage dashboard that is different from the normal timeline,
  instead of stretching the existing list

The next exploration should start from the question:

> What should the extra large-screen space do for triage?

Not:

> How do we make the timeline occupy all available width?
