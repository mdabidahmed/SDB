# Data Contract — `src/data/book.json`

This file is the **single integration contract** between the content-extraction
pipeline and the React application. Neither side may change it unilaterally.

Source of record (higher-resolution edition — use this one):
`/Users/ssh169/Downloads/System Design Interview An Insider’s Guide by Alex Xu (z-lib.org) (1).pdf`
(269 pages, 16 chapters, 226 embedded figures, figure widths 476–1642 px,
median 1302 px).

Superseded, do not use: `System Design Interview by Alex Xu.pdf` — same book and
byte-identical text, but figures are only ~940 px wide.

## Hard requirement

Text must be **verbatim** — not one letter, space, or punctuation mark may differ
from the book. Preserve the book's original Unicode characters exactly:
curly quotes (` ’ “ ” `), en/em dashes (` – — `), ellipsis (`…`), and the bullet
glyph (`•`). Do **not** "normalize" them to ASCII. Do not fix the book's typos.

## Top-level shape

```jsonc
{
  "title": "System Design Interview – An insider's guide",
  "author": "Alex Xu",
  "generatedAt": "<ISO-8601>",
  "chapters": [ Chapter, ... ]
}
```

## Chapter

```jsonc
{
  "id": "chapter-1",              // stable slug, used in the URL
  "number": 1,                    // null for front/back matter (FORWARD, AFTERWORD)
  "title": "SCALE FROM ZERO TO MILLIONS OF USERS",  // verbatim, WITHOUT the "CHAPTER n: " prefix
  "fullTitle": "CHAPTER 1: SCALE FROM ZERO TO MILLIONS OF USERS", // verbatim, as printed
  "pageStart": 5,
  "pageEnd": 33,
  "topics": [ Topic, ... ]
}
```

## Topic

A topic is a section within a chapter, delimited by a **bold 12pt heading line**
(`LiberationSerif-Bold`) or a 13.8pt/16.8pt heading. The prose that appears
before the first bold heading in a chapter belongs to a leading topic whose
`title` is the chapter title and whose `isIntro` is `true`.

```jsonc
{
  "id": "vertical-scaling-vs-horizontal-scaling",  // slug, unique within chapter
  "title": "Vertical scaling vs horizontal scaling", // verbatim heading text
  "isIntro": false,
  "blocks": [ Block, ... ]
}
```

## Block (discriminated union on `type`)

Blocks appear in exact reading order, with figures interleaved at their true
vertical position on the page.

```jsonc
{ "type": "paragraph", "text": "..." }
```
Wrapped lines are rejoined into one logical paragraph with a single space.
A line ending in a soft hyphen that continues the word on the next line must be
de-hyphenated. Otherwise no character is added or removed.

```jsonc
{ "type": "list", "ordered": false, "items": ["...", "..."], "start": null }
```
`items` exclude the leading `•`/number and the space after it. Multi-line items
are rejoined like paragraphs.

`start` is the first printed ordinal when an ordered list does **not** begin at
1, and `null` otherwise. The book continues numbered sequences across an
intervening figure or paragraph, so 6 lists legitimately start at 2, 4 or 6.
Renderers MUST pass this through to `<ol start>`; letting the browser renumber
from 1 would change the numbers printed in the book and violate the
verbatim requirement.

```jsonc
{
  "type": "figure",
  "src": "/figures/fig-1-1.png",  // web path under public/
  "alt": "Figure 1-1",
  "caption": "Figure 1-1",        // null when the figure has no printed caption
  "width": 940, "height": 584,    // intrinsic pixels, for CLS-free layout
  "page": 6
}
```

```jsonc
{ "type": "table", "headers": ["Domain", "IP Address"], "rows": [["mywebsite.com", "88.88.88.1"]] }
```
Only for tables set as real text. Tables that are part of a raster diagram stay
figures.

```jsonc
{ "type": "code", "text": "...", "language": null }
```

```jsonc
{ "type": "heading", "level": 3, "text": "..." }
```
For sub-headings **below** the topic level only. The topic's own heading is not
repeated as a block.

## Figure assets

- Written to `public/figures/`, named `fig-<chapter>-<n>.png` following the
  book's own figure numbering when a caption exists, else `fig-p<page>-<i>.png`.
- Embedded rasters are extracted at **native resolution** (no upscaling, no
  re-compression beyond lossless PNG).
- Vector-only figures (pages where PyMuPDF reports `get_drawings()` but no
  image) are rendered from the clipped page region at **300 DPI**.
- Every figure referenced by a block must exist on disk, and vice versa.

## Sidebar index — `src/data/toc.json`

Derived from `book.json`; lets the sidebar render without parsing the whole book.

```jsonc
[ { "id": "chapter-1", "number": 1, "title": "...", "fullTitle": "...",
    "topics": [ { "id": "...", "title": "..." } ] } ]
```

## Search index — `src/data/search.json`

```jsonc
[ { "chapterId": "...", "chapterTitle": "...", "topicId": "...",
    "topicTitle": "...", "text": "<plain-text of the topic, for matching>" } ]
```

## Routing

`/` → home. `/:chapterId` → chapter (renders all its topics).
`/:chapterId/:topicId` → deep link that scrolls to that topic.
