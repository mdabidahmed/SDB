#!/usr/bin/env python3
"""Extract *System Design Interview – An insider's guide* into the JSON contract.

The pipeline turns the source PDF into the three data files consumed by the
React application (``src/data/book.json``, ``toc.json``, ``search.json``) plus
the figure assets under ``public/figures``.

Design notes
------------
The source PDF is a calibre/Ghostscript rendering of an HTML original.  That
has three consequences the pipeline relies on, each verified against the file
rather than assumed:

* **Body text is ragged-right**, so a line break is a *soft wrap* if and only
  if the first word of the following line could not have fitted on the current
  line.  That geometric test is exact and, unlike a vertical-gap heuristic,
  also works across page boundaries where the gap signal does not exist.
* **The renderer never hyphenates.**  Every line-final hyphen in the document
  is therefore a lexical hyphen belonging to the word (``rate-limiting``,
  ``X-Ratelimit-Retry-After``, a URL, ...) and must be preserved.  Only a real
  U+00AD SOFT HYPHEN is ever removed.  Every decision is written to the audit
  report.
* **Indentation of preformatted blocks is unreliable at the character level.**
  Leading whitespace in the content stream does not match what is printed, so
  the indentation of code blocks is reconstructed from measured glyph origins
  instead of from the extracted spaces.

Text fidelity is the overriding requirement: spans are concatenated verbatim,
no Unicode is normalised, and nothing is reworded.  The only characters the
pipeline removes are the ones the data contract explicitly asks it to remove
(list markers, figure captions that move into the figure block, and running
headers/footers if the document has any).

Run ``python3 scripts/extract.py --help`` for the CLI.
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime as _dt
import json
import logging
import re
import statistics
import sys
import unicodedata
from pathlib import Path
from typing import Any, Sequence

try:
    import fitz  # PyMuPDF
except ImportError as exc:  # pragma: no cover - environment problem
    raise SystemExit("PyMuPDF (fitz) is required: pip install pymupdf") from exc


LOG = logging.getLogger("extract")

REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_PDF = Path(
    "/Users/ssh169/Downloads/"
    "System Design Interview An Insider\u2019s Guide by Alex Xu (z-lib.org) (1).pdf"
)

BOOK_TITLE = "System Design Interview \u2013 An insider's guide"
BOOK_AUTHOR = "Alex Xu"

BOLD_FONTS = frozenset({"LiberationSerif-Bold", "LiberationSerif-BoldItal"})

#: Font size at or above which a heading opens a new *topic*.  The book sets
#: section and sub-section headings alike at 13.8pt and reserves 16.8pt for
#: chapter titles and the closing "Reference materials" section.  Bold 12pt
#: lines sit one level below and become ``heading`` blocks (level 3) inside the
#: current topic, which is what the contract's "sub-headings below the topic
#: level" clause describes.
TOPIC_HEADING_MIN_SIZE = 13.0

#: Anything at or above this size is a chapter-title-scale heading.
CHAPTER_HEADING_MIN_SIZE = 16.0

BULLET = "\u2022"
SOFT_HYPHEN = "\u00ad"

#: An ordinal marker is ``N.`` followed by a space or by a capital letter; the
#: book sets some items without the space (``1.URL shortening``).  Requiring a
#: space-or-capital keeps ``(Table 2-1).``, ``2.1 Client 1 ...``, ``5.a. If
#: User B ...`` and ``1998.`` out of the list machinery.
ORDERED_MARKER_RE = re.compile(r"^(\d{1,2})\.(?=\s|[A-Z])\s*")
CAPTION_RE = re.compile(r"^(?:Figure|Table)\s+(\d+)-(\d+)$")
ASCII_RULE_RE = re.compile(r"^-{3,}$")
#: ``key: value`` / ``- key: value`` shape used to recognise config listings.
CONFIG_LINE_RE = re.compile(r"^\s*(?:-\s+)?[A-Za-z_][\w.\-]*:(?:\s|$)")
OPEN_BRACE_RE = re.compile(r"^[{\[]$")
CLOSE_BRACE_RE = re.compile(r"^[}\]]$")

#: Two spaces per detected indent level when rebuilding preformatted blocks.
CODE_INDENT_SPACES = 2


# --------------------------------------------------------------------------- #
# Primitive records
# --------------------------------------------------------------------------- #


@dataclasses.dataclass(frozen=True)
class Glyph:
    """A single rendered character with its advance-based box."""

    char: str
    x1: float
    origin_x: float


@dataclasses.dataclass
class TextLine:
    """One physical line of text as laid out on the page."""

    page: int
    text: str
    baseline: float
    top: float
    bottom: float
    x0: float
    x1: float
    glyphs: list[Glyph]
    fonts: frozenset[str]
    max_size: float
    grey_backed: bool

    @property
    def stripped(self) -> str:
        return self.text.strip()

    @property
    def is_bold(self) -> bool:
        return bool(self.fonts) and self.fonts <= BOLD_FONTS

    @property
    def is_heading(self) -> bool:
        """A heading line is set entirely in bold, or set at heading size."""
        return self.is_bold or self.max_size >= TOPIC_HEADING_MIN_SIZE

    @property
    def heading_level(self) -> int:
        return 2 if self.max_size >= TOPIC_HEADING_MIN_SIZE else 3

    def first_word_advance(self) -> float:
        """Advance width of the first whitespace-delimited word."""
        i = 0
        while i < len(self.glyphs) and self.glyphs[i].char.isspace():
            i += 1
        if i >= len(self.glyphs):
            return 0.0
        start = self.glyphs[i].origin_x
        j = i
        while j < len(self.glyphs) and not self.glyphs[j].char.isspace():
            j += 1
        if j < len(self.glyphs):
            # A space follows, so its origin is the exact end of the advance.
            return self.glyphs[j].origin_x - start
        return self.glyphs[j - 1].x1 - start


@dataclasses.dataclass
class FigurePlacement:
    """A figure positioned on a page, ready to be interleaved into the flow."""

    page: int
    key: str
    top: float
    bottom: float


@dataclasses.dataclass
class LogicalLine:
    """One or more physical lines rejoined into a single logical line."""

    parts: list[TextLine]
    text: str

    @property
    def head(self) -> TextLine:
        return self.parts[0]

    @property
    def tail(self) -> TextLine:
        return self.parts[-1]

    @property
    def page(self) -> int:
        return self.parts[0].page

    @property
    def wrapped(self) -> bool:
        return len(self.parts) > 1


# --------------------------------------------------------------------------- #
# Document-wide layout measurements
# --------------------------------------------------------------------------- #


@dataclasses.dataclass
class LayoutMetrics:
    """Page geometry measured from the document rather than hardcoded."""

    space_width: float
    line_pitch: float
    hard_break_pitch: float
    right_margin: float
    body_indents: tuple[float, ...]
    calibration_agreement: tuple[int, int]

    @classmethod
    def measure(cls, pages: Sequence[list[TextLine]]) -> "LayoutMetrics":
        space_widths: list[float] = []
        right_edges: list[float] = []
        indents: collections.Counter = collections.Counter()
        gaps: collections.Counter = collections.Counter()

        for lines in pages:
            body = [l for l in lines if l.max_size <= 12.5 and not l.is_bold]
            for line in body:
                right_edges.append(line.x1)
                indents[round(line.x0, 1)] += 1
                for a, b in zip(line.glyphs, line.glyphs[1:]):
                    if a.char == " ":
                        space_widths.append(b.origin_x - a.origin_x)
            for a, b in zip(body, body[1:]):
                gaps[round(b.baseline - a.baseline, 1)] += 1

        if not right_edges:
            raise SystemExit("no body text found; is this the right PDF?")

        space_width = statistics.median(space_widths)
        # The modal gap is the single-line pitch; the next cluster up is the
        # spacing the book puts between separate list items and paragraphs.
        pitch = min(gaps, key=lambda g: (-gaps[g], g))
        larger = [g for g in gaps if g > pitch + 0.8 and gaps[g] >= 20]
        hard_break_pitch = min(larger) if larger else pitch + 2.0
        max_right = max(right_edges)
        body_indents = tuple(sorted(x for x, n in indents.items() if n >= 20))

        margin, agreement = _calibrate_right_margin(
            pages, space_width, pitch, hard_break_pitch, max_right
        )
        return cls(
            space_width=space_width,
            line_pitch=pitch,
            hard_break_pitch=hard_break_pitch,
            right_margin=margin,
            body_indents=body_indents,
            calibration_agreement=agreement,
        )

    def is_standard_indent(self, x: float) -> bool:
        return any(abs(x - known) < 1.0 for known in self.body_indents)


def _calibrate_right_margin(
    pages: Sequence[list[TextLine]],
    space_width: float,
    pitch: float,
    hard_break_pitch: float,
    max_right: float,
) -> tuple[float, tuple[int, int]]:
    """Pick the wrap limit that best explains the observed line breaks.

    The right margin is not recorded in the file; it only shows up indirectly.
    Lines exactly one pitch apart wrapped, so the following word did *not* fit;
    lines a paragraph-gap apart broke deliberately, so it would have.  Sweeping
    the candidate margin and keeping the value that agrees with the most
    observations pins it down without a magic constant.  The objective is flat
    over roughly a 1.5pt plateau, so the result is stable.
    """
    samples: list[tuple[bool, float, float]] = []
    for lines in pages:
        body = [l for l in lines if l.max_size <= 12.5 and not l.is_bold]
        for a, b in zip(body, body[1:]):
            gap = b.baseline - a.baseline
            if abs(gap - pitch) < 0.6:
                wrapped = True
            elif hard_break_pitch - 0.8 <= gap <= hard_break_pitch + 3.5:
                wrapped = False
            else:
                continue
            if a.text.rstrip().endswith("-"):
                continue
            samples.append((wrapped, a.x1, b.first_word_advance()))

    best_margin, best_score = max_right, -1
    steps = int(3.0 / 0.1) + 1
    for step in range(steps):
        candidate = round(max_right - 3.0 + step * 0.1, 2)
        score = sum(
            1
            for wrapped, x1, adv in samples
            if (x1 + space_width + adv > candidate) == wrapped
        )
        if score > best_score:
            best_margin, best_score = candidate, score

    LOG.info(
        "calibrated right margin %.2fpt (max observed line end %.2fpt); "
        "agrees with %d/%d unambiguous line breaks",
        best_margin,
        max_right,
        best_score,
        len(samples),
    )
    return best_margin, (best_score, len(samples))


# --------------------------------------------------------------------------- #
# Page reading
# --------------------------------------------------------------------------- #


def _grey_fill_rects(page: "fitz.Page") -> list["fitz.Rect"]:
    """Rectangles the book paints behind inline code samples."""
    rects = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        if not fill or len(fill) < 3:
            continue
        r, g, b = fill[:3]
        if abs(r - g) < 0.02 and abs(g - b) < 0.02 and 0.5 < r < 0.99:
            rects.append(fitz.Rect(drawing["rect"]))
    return rects


def _overlap_area(a: "fitz.Rect", b: "fitz.Rect") -> float:
    """Area shared by two rectangles."""
    inter = a & b
    return max(0.0, inter.width) * max(0.0, inter.height)


def read_page_lines(page: "fitz.Page") -> list[TextLine]:
    """Return the page's text lines in reading order, verbatim."""
    grey = _grey_fill_rects(page)
    lines: list[TextLine] = []
    for block in page.get_text("rawdict")["blocks"]:
        if block.get("type") != 0:
            continue
        for raw in block["lines"]:
            glyphs: list[Glyph] = []
            fonts: set[str] = set()
            max_size = 0.0
            baselines: list[float] = []
            for span in raw["spans"]:
                if "".join(c["c"] for c in span["chars"]).strip():
                    fonts.add(span["font"])
                    max_size = max(max_size, span["size"])
                    baselines.append(span["origin"][1])
                for ch in span["chars"]:
                    glyphs.append(Glyph(ch["c"], ch["bbox"][2], ch["origin"][0]))
            visible = [g for g in glyphs if g.char.strip()]
            if not visible or not baselines:
                continue
            bbox = raw["bbox"]
            rect = fitz.Rect(bbox)
            area = rect.width * rect.height
            lines.append(
                TextLine(
                    page=page.number,
                    text="".join(g.char for g in glyphs),
                    baseline=min(baselines),
                    top=bbox[1],
                    bottom=bbox[3],
                    x0=visible[0].origin_x,
                    x1=max(g.x1 for g in visible),
                    glyphs=glyphs,
                    fonts=frozenset(fonts),
                    max_size=max_size,
                    grey_backed=any(
                        area > 0 and _overlap_area(r, rect) > 0.5 * area for r in grey
                    ),
                )
            )
    lines.sort(key=lambda l: (round(l.top, 1), l.x0))
    return lines


@dataclasses.dataclass
class RasterRef:
    """An embedded raster and where it sits on the page."""

    xref: int
    top: float
    bottom: float


def read_page_rasters(page: "fitz.Page") -> list[RasterRef]:
    """Embedded rasters on the page, de-duplicated by xref, in reading order."""
    refs: list[RasterRef] = []
    seen: set[int] = set()
    for info in page.get_images(full=True):
        xref = info[0]
        if xref in seen:
            continue
        seen.add(xref)
        rects = page.get_image_rects(xref)
        if not rects:
            LOG.warning("page %d: xref %d has no placement rect", page.number + 1, xref)
            continue
        # One xref may legitimately be placed more than once on a page.
        for rect in rects:
            refs.append(RasterRef(xref=xref, top=rect.y0, bottom=rect.y1))
    refs.sort(key=lambda r: (r.top, r.xref))
    return refs


def detect_vector_figures(page: "fitz.Page") -> list["fitz.Rect"]:
    """Regions drawn with vectors that are genuinely figures.

    Hairline strokes (the blue hyperlink underlines this book uses) and the
    flat grey panels behind inline code are explicitly *not* figures, so a
    region only counts when it has real two-dimensional extent and is not a
    solid neutral fill.
    """
    regions: list[fitz.Rect] = []
    for drawing in page.get_drawings():
        rect = fitz.Rect(drawing["rect"])
        if rect.height < 4.0 or rect.width < 4.0:
            continue  # rules and underlines
        fill = drawing.get("fill")
        if fill and len(fill) >= 3:
            r, g, b = fill[:3]
            if abs(r - g) < 0.02 and abs(g - b) < 0.02:
                continue  # grey/black code-highlight panel
        regions.append(rect)
    return regions


# --------------------------------------------------------------------------- #
# Running headers / footers
# --------------------------------------------------------------------------- #


def detect_running_content(
    pages: Sequence[list[TextLine]], page_height: float
) -> set[tuple[int, int]]:
    """Identify running headers, footers and folio numbers to drop.

    Detection is positional *and* frequency based: a candidate must sit in the
    top or bottom margin band -- outside the band holding the bulk of the body
    text -- and either repeat at a stable vertical position across a large
    share of pages or look like a bare folio.  Requiring both guards against
    deleting real prose: section headings such as "Step 3 - Design deep dive"
    recur on many pages but sit inside the body band.

    Returns ``(page_index, line_index)`` keys.
    """
    tops = [l.top for lines in pages for l in lines]
    if not tops:
        return set()
    body_top = min(tops)
    body_bottom = max(l.bottom for lines in pages for l in lines)
    n_pages = sum(1 for lines in pages if lines)

    header_band = body_top + 0.02 * page_height
    footer_band = body_bottom - 0.02 * page_height

    repeated: dict[tuple[str, int], list[tuple[int, int]]] = collections.defaultdict(list)
    folios: list[tuple[int, int]] = []
    for pno, lines in enumerate(pages):
        for idx, line in enumerate(lines):
            if not (line.bottom < header_band or line.top > footer_band):
                continue
            text = line.stripped
            if re.fullmatch(r"\d{1,4}|[ivxlcdm]{1,7}", text, re.IGNORECASE):
                folios.append((pno, idx))
            else:
                repeated[(text, int(line.top // 5))].append((pno, idx))

    drop: set[tuple[int, int]] = set(folios)
    for (text, _band), hits in repeated.items():
        if len(hits) >= max(5, 0.25 * n_pages):
            LOG.info("dropping running header/footer %r on %d pages", text, len(hits))
            drop.update(hits)
    if folios:
        LOG.info("dropping %d folio (page-number) lines", len(folios))
    if not drop:
        LOG.info(
            "no running headers, footers or folios found: body text occupies "
            "y=%.1f..%.1f on a %.1fpt page, leaving no populated margin band",
            body_top,
            body_bottom,
            page_height,
        )
    return drop


# --------------------------------------------------------------------------- #
# Line joining
# --------------------------------------------------------------------------- #


def list_marker(line: TextLine) -> str | None:
    """``"bullet"``, ``"ordered"`` or ``None`` for a physical line."""
    text = line.stripped
    if text.startswith(BULLET):
        return "bullet"
    if ORDERED_MARKER_RE.match(text):
        return "ordered"
    return None


def is_soft_wrap(prev: TextLine, nxt: TextLine, metrics: LayoutMetrics) -> bool:
    """Decide whether ``nxt`` continues ``prev``'s logical line.

    Within a page the baselines must be exactly one line pitch apart *and* the
    first word of ``nxt`` must not have fitted on ``prev``.  Across a page
    break the pitch is unavailable, so only the geometric test applies.
    """
    if prev.is_heading or nxt.is_heading:
        return False
    if list_marker(nxt):
        return False
    if abs(prev.x0 - nxt.x0) > 1.0:
        return False  # a change of indent always starts a new logical line
    if prev.text.rstrip().endswith("-"):
        forced = True
    else:
        needed = prev.x1 + metrics.space_width + nxt.first_word_advance()
        forced = needed > metrics.right_margin
    if prev.page != nxt.page:
        return forced
    same_pitch = abs(nxt.baseline - prev.baseline - metrics.line_pitch) < 0.8
    return same_pitch and forced


@dataclasses.dataclass
class HyphenDecision:
    page: int
    left: str
    right: str
    joined: str
    dehyphenated: bool
    reason: str


def join_line_pair(left: str, right: str, page: int, log: list[HyphenDecision]) -> str:
    """Join two physical lines into one logical line.

    Wrapped lines are joined with exactly one space.  A line-final hyphen joins
    with no space and the hyphen is kept, because this PDF is reflowed HTML and
    the renderer cannot have introduced a hyphen that is not in the text; only
    a real U+00AD SOFT HYPHEN is removed.
    """
    lhs = left.rstrip()
    rhs = right.lstrip()
    if lhs.endswith(SOFT_HYPHEN):
        log.append(
            HyphenDecision(page, lhs[-28:], rhs[:28], lhs[-28:-1] + rhs[:28], True,
                           "U+00AD soft hyphen removed")
        )
        return lhs[:-1] + rhs
    if lhs.endswith("-"):
        log.append(
            HyphenDecision(page, lhs[-28:], rhs[:28], lhs[-28:] + rhs[:28], False,
                           "lexical hyphen kept (renderer never hyphenates)")
        )
        return lhs + rhs
    if not lhs:
        return rhs
    if not rhs:
        return lhs
    return f"{lhs} {rhs}"


def join_lines(
    lines: Sequence[TextLine], metrics: LayoutMetrics, hyphen_log: list[HyphenDecision]
) -> list[LogicalLine]:
    """Collapse soft-wrapped physical lines into logical lines."""
    logical: list[LogicalLine] = []
    for line in lines:
        if logical and is_soft_wrap(logical[-1].tail, line, metrics):
            current = logical[-1]
            current.text = join_line_pair(current.text, line.text, line.page, hyphen_log)
            current.parts.append(line)
        else:
            logical.append(LogicalLine(parts=[line], text=line.text))
    return logical


# --------------------------------------------------------------------------- #
# Preformatted (code) blocks
# --------------------------------------------------------------------------- #


@dataclasses.dataclass
class CodeRun:
    start: int
    end: int  # exclusive
    reason: str


def find_code_runs(
    logical: Sequence[LogicalLine], metrics: LayoutMetrics
) -> list[CodeRun]:
    """Locate preformatted listings among the logical lines.

    A listing is a run of consecutive, never-wrapping logical lines that
    carries at least one positive signal:

    ``grey``    the lines sit on the grey panels the book paints behind code;
    ``braces``  the run is delimited by a lone ``{`` / ``}``;
    ``indent``  a glyph starts outside the book's standard text indents;
    ``rule``    the run contains an ASCII rule such as ``-----------``;
    ``config``  every line has ``key: value`` shape and none reads as prose.

    ``grey`` and ``braces`` delimit their block precisely; the others apply to
    the whole run, whose extent the surrounding paragraph gaps already bound.
    """
    runs: list[CodeRun] = []
    i = 0
    n = len(logical)
    while i < n:
        if logical[i].wrapped or logical[i].head.is_heading or list_marker(logical[i].head):
            i += 1
            continue
        j = i + 1
        while j < n:
            cur, prev = logical[j], logical[j - 1]
            if cur.wrapped or cur.head.is_heading or list_marker(cur.head):
                break
            if cur.page == prev.tail.page:
                if cur.head.baseline - prev.tail.baseline > metrics.hard_break_pitch + 1.0:
                    break
            elif cur.page != prev.tail.page + 1:
                break
            j += 1
        if j - i >= 2:
            found = _classify_run(logical[i:j], i, metrics)
            if found:
                runs.extend(found)
        i = max(j, i + 1)
    return runs


def _classify_run(
    run: Sequence[LogicalLine], offset: int, metrics: LayoutMetrics
) -> list[CodeRun]:
    texts = [l.text.strip() for l in run]

    grey = [k for k, l in enumerate(run) if l.head.grey_backed]
    if grey:
        return [CodeRun(offset + grey[0], offset + grey[-1] + 1, "grey")]

    opens = [k for k, t in enumerate(texts) if OPEN_BRACE_RE.match(t)]
    closes = [k for k, t in enumerate(texts) if CLOSE_BRACE_RE.match(t)]
    if opens and closes and closes[-1] > opens[0]:
        return [CodeRun(offset + opens[0], offset + closes[-1] + 1, "braces")]

    if any(not metrics.is_standard_indent(l.head.x0) for l in run):
        return [CodeRun(offset, offset + len(run), "indent")]

    if any(ASCII_RULE_RE.match(t) for t in texts):
        return [CodeRun(offset, offset + len(run), "rule")]

    if all(CONFIG_LINE_RE.match(t) for t in texts) and not any(
        t.endswith((".", "?", "!")) for t in texts
    ):
        return [CodeRun(offset, offset + len(run), "config")]

    return []


def render_code_block(run: Sequence[LogicalLine], metrics: LayoutMetrics) -> str:
    """Rebuild a listing's indentation from measured glyph positions.

    The leading spaces in the extracted text do not match what is printed: the
    layout engine splits the indent between a block offset and literal space
    glyphs, and the two available source PDFs of this book even disagree about
    the split.  Ranking the distinct left edges the run actually uses and
    re-emitting :data:`CODE_INDENT_SPACES` per level reproduces the printed
    alignment and is immune to that artefact.
    """
    levels: list[float] = []
    for x in sorted({round(l.head.x0, 1) for l in run}):
        if not levels or x - levels[-1] > metrics.space_width / 2:
            levels.append(x)
    out = []
    for line in run:
        x = round(line.head.x0, 1)
        level = max(k for k, edge in enumerate(levels) if x >= edge - 0.05)
        out.append(" " * (CODE_INDENT_SPACES * level) + line.text.strip())
    return "\n".join(out)


def detect_text_table(run: Sequence[LogicalLine]) -> dict[str, Any] | None:
    """Recognise a listing that is really a table set as text.

    A text table needs at least two columns, which shows up as a wide internal
    horizontal gap repeated on every line with a consistent cell count.  Every
    table in this book is a raster diagram, so this finds none -- but a wrong
    table is worse than no table, so the bar is deliberately high.
    """
    rows: list[list[str]] = []
    for line in run:
        glyphs = line.head.glyphs
        cells: list[str] = []
        start = 0
        for k, (a, b) in enumerate(zip(glyphs, glyphs[1:])):
            if b.origin_x - a.x1 > 12.0:
                cells.append("".join(g.char for g in glyphs[start : k + 1]).strip())
                start = k + 1
        cells.append("".join(g.char for g in glyphs[start:]).strip())
        if len(cells) < 2:
            return None
        rows.append(cells)
    if len({len(r) for r in rows}) != 1 or len(rows) < 2:
        return None
    return {"type": "table", "headers": rows[0], "rows": [list(r) for r in rows[1:]]}


# --------------------------------------------------------------------------- #
# Block assembly
# --------------------------------------------------------------------------- #


def strip_list_marker(text: str) -> str:
    """Remove a leading bullet or ordinal and the space after it."""
    stripped = text.strip()
    if stripped.startswith(BULLET):
        return stripped[1:].lstrip(" ")
    match = ORDERED_MARKER_RE.match(stripped)
    return stripped[match.end():] if match else stripped


@dataclasses.dataclass
class SegmentResult:
    blocks: list[dict[str, Any]]
    code_runs: list[str]
    ordered_restarts: list[tuple[int, int]]


def blocks_for_lines(
    segment: Sequence[TextLine],
    metrics: LayoutMetrics,
    hyphen_log: list[HyphenDecision],
) -> SegmentResult:
    """Turn a run of physical lines into contract blocks."""
    result = SegmentResult([], [], [])
    if not segment:
        return result

    logical = join_lines(segment, metrics, hyphen_log)
    runs = find_code_runs(logical, metrics)
    by_start = {run.start: run for run in runs}
    inside = {k for run in runs for k in range(run.start, run.end)}

    idx = 0
    while idx < len(logical):
        run = by_start.get(idx)
        if run is not None:
            members = logical[run.start : run.end]
            table = detect_text_table(members)
            if table is not None:
                result.blocks.append(table)
            else:
                text = render_code_block(members, metrics)
                result.blocks.append({"type": "code", "text": text, "language": None})
                result.code_runs.append(
                    f"p{members[0].page + 1} [{run.reason}]\n{text}"
                )
            idx = run.end
            continue
        if idx in inside:
            idx += 1
            continue

        line = logical[idx]
        head = line.head

        if head.is_heading:
            result.blocks.append(
                {"type": "heading", "level": head.heading_level, "text": line.text.strip()}
            )
            idx += 1
            continue

        marker = list_marker(head)
        if marker:
            indent = round(head.x0, 1)
            first = ORDERED_MARKER_RE.match(head.stripped) if marker == "ordered" else None
            items: list[str] = []
            while idx < len(logical) and idx not in inside:
                candidate = logical[idx]
                if list_marker(candidate.head) != marker:
                    break
                if abs(round(candidate.head.x0, 1) - indent) > 1.0:
                    break
                items.append(strip_list_marker(candidate.text))
                idx += 1
            block: dict[str, Any] = {
                "type": "list",
                "ordered": marker == "ordered",
                "items": items,
            }
            if first is not None and first.group(1) != "1":
                # The book's own ordinal. A nested sub-list interrupts the
                # parent list, and the flat block shape cannot express that
                # nesting, so the continuation would otherwise restart at 1 and
                # contradict the printed page. The field is additive: a
                # renderer that ignores it behaves exactly as before.
                block["start"] = int(first.group(1))
                result.ordered_restarts.append((head.page + 1, block["start"]))
            result.blocks.append(block)
            continue

        result.blocks.append({"type": "paragraph", "text": line.text.strip()})
        idx += 1
    return result


def build_blocks(
    items: Sequence[Any],
    metrics: LayoutMetrics,
    figures: dict[str, dict[str, Any]],
    hyphen_log: list[HyphenDecision],
) -> SegmentResult:
    """Assemble blocks from a page-ordered stream of lines and figures.

    A figure always closes the surrounding text segment, which keeps figures at
    their true position in the flow and stops a paragraph from being joined
    across a diagram.
    """
    combined = SegmentResult([], [], [])
    buffer: list[TextLine] = []

    def flush() -> None:
        nonlocal buffer
        part = blocks_for_lines(buffer, metrics, hyphen_log)
        combined.blocks.extend(part.blocks)
        combined.code_runs.extend(part.code_runs)
        combined.ordered_restarts.extend(part.ordered_restarts)
        buffer = []

    for item in items:
        if isinstance(item, FigurePlacement):
            flush()
            combined.blocks.append(figures[item.key])
        else:
            buffer.append(item)
    flush()
    return combined


# --------------------------------------------------------------------------- #
# Chapters, topics, slugs
# --------------------------------------------------------------------------- #


def slugify(value: str) -> str:
    """URL-safe slug: ASCII lowercase, digits and single hyphens."""
    ascii_only = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    )
    return re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower() or "section"


def unique_slug(base: str, taken: set[str]) -> str:
    slug, n = base, 2
    while slug in taken:
        slug = f"{base}-{n}"
        n += 1
    taken.add(slug)
    return slug


@dataclasses.dataclass
class ChapterRange:
    full_title: str
    number: int | None
    first_page: int  # 0-indexed, inclusive
    last_page: int  # 0-indexed, inclusive
    title_page: int  # page the outline points at, where the title is printed


def build_chapter_ranges(doc: "fitz.Document") -> list[ChapterRange]:
    """Chapter page ranges from the PDF outline, covering every page exactly once."""
    toc = doc.get_toc()
    if not toc:
        raise SystemExit("the PDF has no table of contents to split on")

    ranges: list[ChapterRange] = []
    for i, (_level, title, page_1indexed) in enumerate(toc):
        last = (toc[i + 1][2] - 2) if i + 1 < len(toc) else doc.page_count - 1
        match = re.match(r"^CHAPTER\s+(\d+):", title)
        ranges.append(
            ChapterRange(
                full_title=title,
                number=int(match.group(1)) if match else None,
                first_page=page_1indexed - 1,
                last_page=last,
                title_page=page_1indexed - 1,
            )
        )
    # Front cover art sits before the first outline entry; fold it into the
    # opening section so every page belongs to exactly one chapter.
    if ranges[0].first_page > 0:
        LOG.info(
            "attaching front matter pages 1-%d to %r",
            ranges[0].first_page,
            ranges[0].full_title,
        )
        ranges[0].first_page = 0
    return ranges


def split_into_topics(
    blocks: Sequence[dict[str, Any]], chapter_title: str
) -> list[dict[str, Any]]:
    """Split a chapter's blocks into topics on topic-level (level 2) headings."""
    taken: set[str] = set()

    def new_topic(title: str, is_intro: bool) -> dict[str, Any]:
        return {
            "id": unique_slug(slugify(title), taken),
            "title": title,
            "isIntro": is_intro,
            "blocks": [],
        }

    topics: list[dict[str, Any]] = []
    current = new_topic(chapter_title, True)
    for block in blocks:
        if block.get("type") == "heading" and block.get("level") == 2:
            topics.append(current)
            current = new_topic(block["text"], False)
        else:
            current["blocks"].append(block)
    topics.append(current)

    if topics[0]["isIntro"] and not topics[0]["blocks"] and len(topics) > 1:
        topics.pop(0)
    return topics


# --------------------------------------------------------------------------- #
# Figures on disk
# --------------------------------------------------------------------------- #


def write_raster(doc: "fitz.Document", xref: int, path: Path) -> tuple[int, int]:
    """Write one embedded raster to a lossless PNG at its native resolution."""
    pix = fitz.Pixmap(doc, xref)
    if pix.colorspace is None or pix.colorspace.n > 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    pix.save(path)
    return pix.width, pix.height


def render_vector_figure(
    page: "fitz.Page", rect: "fitz.Rect", path: Path, dpi: int
) -> tuple[int, int]:
    """Render a vector-only figure from the clipped page region."""
    pix = page.get_pixmap(dpi=dpi, clip=rect)
    pix.save(path)
    return pix.width, pix.height


def match_captions(
    lines: list[TextLine], rasters: Sequence[RasterRef]
) -> dict[int, str]:
    """Pair printed ``Figure n-m`` caption lines with the raster above them.

    Almost every diagram has its caption baked into the bitmap; only a handful
    are set as live text.  Matched caption lines are removed from ``lines`` so
    they move into the figure block instead of being emitted twice.
    """
    captions: dict[int, str] = {}
    for line in list(lines):
        if not CAPTION_RE.match(line.stripped):
            continue
        above = [r for r in rasters if r.bottom <= line.top + 2.0]
        if not above:
            continue
        target = max(above, key=lambda r: r.bottom)
        captions[target.xref] = line.stripped
        lines.remove(line)
    return captions


# --------------------------------------------------------------------------- #
# Pipeline
# --------------------------------------------------------------------------- #


@dataclasses.dataclass
class ExtractionReport:
    metrics: LayoutMetrics | None = None
    hyphens: list[HyphenDecision] = dataclasses.field(default_factory=list)
    code_blocks: list[str] = dataclasses.field(default_factory=list)
    ordered_restarts: list[tuple[int, int]] = dataclasses.field(default_factory=list)
    vector_figures: list[str] = dataclasses.field(default_factory=list)
    figure_sizes: list[tuple[str, int, int]] = dataclasses.field(default_factory=list)
    captions: list[tuple[str, str]] = dataclasses.field(default_factory=list)
    dropped_running: int = 0


def extract(
    pdf_path: Path,
    data_dir: Path,
    figures_dir: Path,
    vector_dpi: int,
    generated_at: str,
) -> ExtractionReport:
    doc = fitz.open(pdf_path)
    LOG.info("opened %s (%d pages)", pdf_path.name, doc.page_count)

    pages_lines = [read_page_lines(doc[p]) for p in range(doc.page_count)]
    metrics = LayoutMetrics.measure(pages_lines)
    LOG.info(
        "layout: space=%.3fpt pitch=%.1fpt break-pitch=%.1fpt indents=%s",
        metrics.space_width,
        metrics.line_pitch,
        metrics.hard_break_pitch,
        metrics.body_indents,
    )

    report = ExtractionReport(metrics=metrics)
    drop = detect_running_content(pages_lines, doc[0].rect.height)
    report.dropped_running = len(drop)
    for pno, idx in sorted(drop, reverse=True):
        del pages_lines[pno][idx]

    figures_dir.mkdir(parents=True, exist_ok=True)
    for stale in figures_dir.iterdir():
        if stale.is_file():
            stale.unlink()

    chapters_json: list[dict[str, Any]] = []
    chapter_slugs: set[str] = set()

    for chapter in build_chapter_ranges(doc):
        items: list[Any] = []
        figure_meta: dict[str, dict[str, Any]] = {}
        title_lines: list[TextLine] = []

        for pno in range(chapter.first_page, chapter.last_page + 1):
            page = doc[pno]
            lines = pages_lines[pno]

            # The chapter's own title belongs to the chapter record, not to a
            # block, so consume the heading-sized lines that open the page the
            # outline points at (which is not necessarily the first page of the
            # range -- the front cover precedes the opening section).
            if pno == chapter.title_page:
                while lines and lines[0].max_size >= CHAPTER_HEADING_MIN_SIZE:
                    title_lines.append(lines.pop(0))

            rasters = read_page_rasters(page)
            captions = match_captions(lines, rasters)

            for seq, raster in enumerate(rasters, start=1):
                name = _figure_name(pno, seq, captions.get(raster.xref))
                width, height = write_raster(doc, raster.xref, figures_dir / f"{name}.png")
                caption = captions.get(raster.xref)
                key = f"{pno}:{raster.xref}:{seq}"
                figure_meta[key] = {
                    "type": "figure",
                    "src": f"/figures/{name}.png",
                    "alt": caption or f"Figure on page {pno + 1}",
                    "caption": caption,
                    "width": width,
                    "height": height,
                    "page": pno + 1,
                }
                items.append(FigurePlacement(pno, key, raster.top, raster.bottom))
                report.figure_sizes.append((name, width, height))
                if caption:
                    report.captions.append((name, caption))

            for seq, rect in enumerate(detect_vector_figures(page), start=1):
                name = f"fig-p{pno + 1}-v{seq}"
                width, height = render_vector_figure(
                    page, rect, figures_dir / f"{name}.png", vector_dpi
                )
                key = f"{pno}:vector:{seq}"
                figure_meta[key] = {
                    "type": "figure",
                    "src": f"/figures/{name}.png",
                    "alt": f"Figure on page {pno + 1}",
                    "caption": None,
                    "width": width,
                    "height": height,
                    "page": pno + 1,
                }
                items.append(FigurePlacement(pno, key, rect.y0, rect.y1))
                report.figure_sizes.append((name, width, height))
                report.vector_figures.append(name)

            items.extend(lines)

        items.sort(key=lambda it: (it.page, it.top))
        built = build_blocks(items, metrics, figure_meta, report.hyphens)
        report.code_blocks.extend(built.code_runs)
        report.ordered_restarts.extend(built.ordered_restarts)

        printed_title = " ".join(l.stripped for l in title_lines).strip()
        full_title = printed_title or chapter.full_title
        match = re.match(r"^CHAPTER\s+\d+:\s*(.+)$", full_title)
        title = (match.group(1) if match else full_title).strip()

        topics = split_into_topics(built.blocks, title)
        chapters_json.append(
            {
                "id": unique_slug(
                    f"chapter-{chapter.number}" if chapter.number else slugify(title),
                    chapter_slugs,
                ),
                "number": chapter.number,
                "title": title,
                "fullTitle": full_title,
                "pageStart": chapter.first_page + 1,
                "pageEnd": chapter.last_page + 1,
                "topics": topics,
            }
        )
        LOG.info(
            "%-56s pages %3d-%3d topics=%2d figures=%2d",
            full_title[:56],
            chapter.first_page + 1,
            chapter.last_page + 1,
            len(topics),
            sum(1 for it in items if isinstance(it, FigurePlacement)),
        )

    data_dir.mkdir(parents=True, exist_ok=True)
    _write_json(
        data_dir / "book.json",
        {
            "title": BOOK_TITLE,
            "author": BOOK_AUTHOR,
            "generatedAt": generated_at,
            "chapters": chapters_json,
        },
    )
    _write_json(data_dir / "toc.json", _build_toc(chapters_json))
    _write_json(data_dir / "search.json", _build_search(chapters_json))
    return report


def _figure_name(page: int, seq: int, caption: str | None) -> str:
    """Name a figure file.

    The contract asks for the book's own numbering when a caption exists.  In
    this edition the captions are pixels inside the diagrams rather than live
    text, so for all but a handful there is nothing reliable to read a number
    from and the page-based fallback applies.
    """
    if caption:
        match = CAPTION_RE.match(caption)
        if match:
            return f"fig-{match.group(1)}-{match.group(2)}"
    return f"fig-p{page + 1}-{seq}"


def _block_plain_text(block: dict[str, Any]) -> str:
    kind = block["type"]
    if kind in ("paragraph", "code", "heading"):
        return block["text"]
    if kind == "list":
        return "\n".join(block["items"])
    if kind == "table":
        return "\n".join(" ".join(row) for row in [block["headers"], *block["rows"]])
    if kind == "figure":
        return block["caption"] or ""
    return ""


def _build_toc(chapters: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": ch["id"],
            "number": ch["number"],
            "title": ch["title"],
            "fullTitle": ch["fullTitle"],
            "topics": [{"id": t["id"], "title": t["title"]} for t in ch["topics"]],
        }
        for ch in chapters
    ]


def _build_search(chapters: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    entries = []
    for ch in chapters:
        for topic in ch["topics"]:
            text = "\n".join(
                part for part in (_block_plain_text(b) for b in topic["blocks"]) if part
            )
            entries.append(
                {
                    "chapterId": ch["id"],
                    "chapterTitle": ch["title"],
                    "topicId": topic["id"],
                    "topicTitle": topic["title"],
                    "text": text,
                }
            )
    return entries


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    LOG.info("wrote %s (%.1f KB)", path.name, path.stat().st_size / 1024)


# --------------------------------------------------------------------------- #
# Audit report + CLI
# --------------------------------------------------------------------------- #


def write_audit_report(path: Path, report: ExtractionReport) -> None:
    out: list[str] = ["# Extraction audit", ""]

    if report.metrics:
        m = report.metrics
        agree, total = m.calibration_agreement
        out += [
            "## Measured layout",
            "",
            f"- space advance: {m.space_width:.3f}pt",
            f"- line pitch: {m.line_pitch:.1f}pt, hard-break pitch: {m.hard_break_pitch:.1f}pt",
            f"- calibrated right margin: {m.right_margin:.2f}pt "
            f"({agree}/{total} = {100.0 * agree / total:.2f}% of unambiguous breaks explained)",
            f"- standard text indents: {', '.join(f'{x:.1f}pt' for x in m.body_indents)}",
            f"- running header/footer lines removed: {report.dropped_running}",
            "",
        ]

    dehyphenated = sum(1 for d in report.hyphens if d.dehyphenated)
    out += [
        f"## Line-final hyphens ({len(report.hyphens)}; {dehyphenated} de-hyphenated)",
        "",
    ]
    for d in report.hyphens:
        verdict = "DE-HYPHENATED" if d.dehyphenated else "kept"
        out.append(
            f"- p{d.page + 1} {verdict}: {d.left!r} + {d.right!r} -> {d.joined!r}  [{d.reason}]"
        )

    out += ["", f"## Preformatted blocks ({len(report.code_blocks)})", ""]
    for text in report.code_blocks:
        head, _, body = text.partition("\n")
        out += [f"### {head}", "", "```", body, "```", ""]

    out += [f"## Ordered lists not starting at 1 ({len(report.ordered_restarts)})", ""]
    for page, number in report.ordered_restarts:
        out.append(f"- p{page}: first printed ordinal is {number}")

    out += ["", f"## Printed text captions ({len(report.captions)})", ""]
    for name, caption in report.captions:
        out.append(f"- {name}: {caption!r}")

    out += ["", f"## Vector-rendered figures ({len(report.vector_figures)})", ""]
    out += [f"- {n}" for n in report.vector_figures] or ["(none)"]

    if report.figure_sizes:
        widths = sorted(w for _n, w, _h in report.figure_sizes)
        heights = sorted(h for _n, _w, h in report.figure_sizes)
        out += [
            "",
            "## Figure resolution",
            "",
            f"- count: {len(report.figure_sizes)}",
            f"- width:  min {widths[0]} / median {widths[len(widths) // 2]} / max {widths[-1]}",
            f"- height: min {heights[0]} / median {heights[len(heights) // 2]} / max {heights[-1]}",
        ]

    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    LOG.info("wrote %s", path.name)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract the book PDF into the src/data JSON contract.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="source PDF")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=REPO_ROOT / "src" / "data",
        help="directory for book.json, toc.json and search.json",
    )
    parser.add_argument(
        "--figures-dir",
        type=Path,
        default=REPO_ROOT / "public" / "figures",
        help="directory for figure PNGs (emptied on each run)",
    )
    parser.add_argument(
        "--audit",
        type=Path,
        default=REPO_ROOT / "scripts" / "extraction-audit.md",
        help="path for the human-readable audit report",
    )
    parser.add_argument(
        "--vector-dpi", type=int, default=300, help="render DPI for vector-only figures"
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="ISO-8601 stamp for book.json (default: now; pin it for byte-identical reruns)",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
        stream=sys.stderr,
    )
    if not args.pdf.exists():
        LOG.error("source PDF not found: %s", args.pdf)
        return 2

    generated_at = args.generated_at or (
        _dt.datetime.now(_dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    report = extract(
        pdf_path=args.pdf,
        data_dir=args.data_dir,
        figures_dir=args.figures_dir,
        vector_dpi=args.vector_dpi,
        generated_at=generated_at,
    )
    write_audit_report(args.audit, report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
