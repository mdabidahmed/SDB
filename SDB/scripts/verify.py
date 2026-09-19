#!/usr/bin/env python3
"""Verify the extracted book data against the source PDF and the data contract.

This is deliberately an *independent* reimplementation: it re-reads the PDF
with :func:`fitz.Page.get_text` rather than reusing anything from
``extract.py``, so a bug in the extractor's line model cannot hide itself here.

Checks performed
----------------
1. **Figure integrity** -- every ``figure`` block points at a file that exists,
   every file in ``public/figures`` is referenced exactly once, and the
   recorded intrinsic size matches the PNG on disk.
2. **Round-trip fidelity** -- for each chapter, all extracted text is
   concatenated and compared, whitespace-insensitively, with the raw text of
   that chapter's page range.  Characters lost or added are reported per
   chapter.  This is the guard for "not a single letter change".
3. **No leaked furniture** -- no block text contains a running header or a bare
   page-number artefact.
4. **Structure** -- the JSON parses, ids are unique, slugs are URL-safe, page
   ranges tile the document exactly once, and ``toc.json`` / ``search.json``
   agree with ``book.json``.

Exit status is non-zero when any check fails.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import struct
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Sequence

try:
    import fitz  # PyMuPDF
except ImportError as exc:  # pragma: no cover - environment problem
    raise SystemExit("PyMuPDF (fitz) is required: pip install pymupdf") from exc


LOG = logging.getLogger("verify")
REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_PDF = Path(
    "/Users/ssh169/Downloads/"
    "System Design Interview An Insider\u2019s Guide by Alex Xu (z-lib.org) (1).pdf"
)

BULLET = "\u2022"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ORDINAL_RE = re.compile(r"^(\d{1,2})\.(?=\s|[A-Z])\s*")

#: A bare folio, or a header of the form "CHAPTER n: ..." appearing mid-prose.
PAGE_ARTEFACT_RE = re.compile(r"(?:^|\s)(?:Page\s+\d{1,4}|\|\s*\d{1,4}\s*\|)(?:\s|$)")


class Results:
    """Collects pass/fail lines for the printed report."""

    def __init__(self) -> None:
        self.sections: list[tuple[str, list[str], list[str]]] = []

    def add(self, name: str, oks: Iterable[str], failures: Iterable[str]) -> None:
        self.sections.append((name, list(oks), list(failures)))

    @property
    def failed(self) -> bool:
        return any(f for _n, _o, f in self.sections)

    def render(self) -> str:
        out: list[str] = []
        for name, oks, failures in self.sections:
            status = "FAIL" if failures else "PASS"
            out.append(f"[{status}] {name}")
            for line in oks:
                out.append(f"         {line}")
            for line in failures:
                out.append(f"    ...  {line}")
            out.append("")
        total_fail = sum(len(f) for _n, _o, f in self.sections)
        out.append("=" * 72)
        out.append("VERIFICATION FAILED" if total_fail else "ALL CHECKS PASSED")
        if total_fail:
            out.append(f"{total_fail} problem(s) reported above.")
        return "\n".join(out)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def iter_blocks(book: dict[str, Any]):
    """Yield ``(chapter, topic, block)`` for every block in the book."""
    for chapter in book["chapters"]:
        for topic in chapter["topics"]:
            for block in topic["blocks"]:
                yield chapter, topic, block


def png_size(path: Path) -> tuple[int, int]:
    """Intrinsic size from a PNG's IHDR chunk."""
    with path.open("rb") as fh:
        header = fh.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    width, height = struct.unpack(">II", header[16:24])
    return int(width), int(height)


def block_text(block: dict[str, Any]) -> str:
    """All human-readable text a block contributes, with list markers restored.

    The contract strips the leading ``•``/ordinal from list items, so they are
    put back here; otherwise the round-trip would report them as lost
    characters even though their removal is exactly what the contract asks for.
    """
    kind = block["type"]
    if kind in ("paragraph", "code", "heading"):
        return block["text"]
    if kind == "list":
        if block["ordered"]:
            start = block.get("start", 1)
            return "\n".join(
                f"{start + i}. {item}" for i, item in enumerate(block["items"])
            )
        return "\n".join(f"{BULLET} {item}" for item in block["items"])
    if kind == "table":
        return "\n".join(" ".join(r) for r in [block["headers"], *block["rows"]])
    if kind == "figure":
        return block["caption"] or ""
    raise ValueError(f"unknown block type {kind!r}")


def chapter_text(chapter: dict[str, Any]) -> str:
    """Everything the chapter renders, in order, including its headings."""
    parts = [chapter["fullTitle"]]
    for topic in chapter["topics"]:
        if not topic["isIntro"]:
            parts.append(topic["title"])
        parts.extend(block_text(b) for b in topic["blocks"])
    return "\n".join(parts)


def squeeze(text: str) -> str:
    """Drop all whitespace so only characters are compared."""
    return "".join(text.split())


def char_delta(expected: str, actual: str) -> tuple[Counter, Counter]:
    """Multiset of characters lost from ``expected`` and added in ``actual``."""
    exp, act = Counter(expected), Counter(actual)
    return exp - act, act - exp


def first_divergence(expected: str, actual: str, window: int = 70) -> str:
    """Describe where two squeezed strings first differ."""
    limit = min(len(expected), len(actual))
    i = 0
    while i < limit and expected[i] == actual[i]:
        i += 1
    if i == limit and len(expected) == len(actual):
        return "identical"
    lo = max(0, i - window // 2)
    return (
        f"first difference at char {i}\n"
        f"           pdf : ...{expected[lo:i + window]!r}\n"
        f"           json: ...{actual[lo:i + window]!r}"
    )


# --------------------------------------------------------------------------- #
# Checks
# --------------------------------------------------------------------------- #


def check_structure(book: dict[str, Any], doc: "fitz.Document", results: Results) -> None:
    oks: list[str] = []
    bad: list[str] = []

    for key in ("title", "author", "generatedAt", "chapters"):
        if key not in book:
            bad.append(f"book.json is missing top-level key {key!r}")

    chapter_ids = [c["id"] for c in book["chapters"]]
    dupes = [i for i, n in Counter(chapter_ids).items() if n > 1]
    if dupes:
        bad.append(f"duplicate chapter ids: {dupes}")
    for cid in chapter_ids:
        if not SLUG_RE.match(cid):
            bad.append(f"chapter id is not URL-safe: {cid!r}")

    n_topics = 0
    for chapter in book["chapters"]:
        topic_ids = [t["id"] for t in chapter["topics"]]
        n_topics += len(topic_ids)
        for tid, count in Counter(topic_ids).items():
            if count > 1:
                bad.append(f"{chapter['id']}: duplicate topic id {tid!r}")
        for tid in topic_ids:
            if not SLUG_RE.match(tid):
                bad.append(f"{chapter['id']}: topic id is not URL-safe: {tid!r}")
        if not chapter["topics"]:
            bad.append(f"{chapter['id']}: has no topics")
        if len(chapter["topics"]) >= 40:
            bad.append(
                f"{chapter['id']}: {len(chapter['topics'])} topics -- "
                "heading detection is probably wrong"
            )
        intros = [t for t in chapter["topics"] if t["isIntro"]]
        if len(intros) > 1:
            bad.append(f"{chapter['id']}: {len(intros)} topics marked isIntro")

    # Page ranges must tile the document exactly once.
    covered: Counter = Counter()
    for chapter in book["chapters"]:
        if chapter["pageStart"] > chapter["pageEnd"]:
            bad.append(f"{chapter['id']}: inverted page range")
        for page in range(chapter["pageStart"], chapter["pageEnd"] + 1):
            covered[page] += 1
    missing = [p for p in range(1, doc.page_count + 1) if covered[p] == 0]
    doubled = [p for p, n in covered.items() if n > 1]
    if missing:
        bad.append(f"pages covered by no chapter: {missing}")
    if doubled:
        bad.append(f"pages covered by more than one chapter: {sorted(doubled)}")

    # Chapter titles must match the PDF outline.
    outline = {title for _lvl, title, _pg in doc.get_toc()}
    for chapter in book["chapters"]:
        if chapter["fullTitle"].strip() not in outline:
            bad.append(
                f"{chapter['id']}: fullTitle {chapter['fullTitle']!r} is not in the PDF outline"
            )
        if chapter["number"] is not None:
            prefix = f"CHAPTER {chapter['number']}: "
            if not chapter["fullTitle"].startswith(prefix):
                bad.append(f"{chapter['id']}: number does not match fullTitle")
            if chapter["fullTitle"][len(prefix):].strip() != chapter["title"].strip():
                bad.append(f"{chapter['id']}: title is not fullTitle minus the prefix")

    oks.append(f"{len(book['chapters'])} chapters, {n_topics} topics, all ids unique and URL-safe")
    oks.append(f"page ranges tile all {doc.page_count} pages exactly once")
    results.add("structure / ids / page ranges", oks, bad)


def check_block_shapes(book: dict[str, Any], results: Results) -> None:
    oks: list[str] = []
    bad: list[str] = []
    counts: Counter = Counter()

    allowed = {
        "paragraph": {"type", "text"},
        "code": {"type", "text", "language"},
        "heading": {"type", "level", "text"},
        "list": {"type", "ordered", "items", "start"},
        "table": {"type", "headers", "rows"},
        "figure": {"type", "src", "alt", "caption", "width", "height", "page"},
    }
    required = {k: v - {"start"} for k, v in allowed.items()}

    for chapter, topic, block in iter_blocks(book):
        kind = block.get("type")
        counts[kind] += 1
        where = f"{chapter['id']}/{topic['id']}"
        if kind not in allowed:
            bad.append(f"{where}: unknown block type {kind!r}")
            continue
        extra = set(block) - allowed[kind]
        absent = required[kind] - set(block)
        if extra:
            bad.append(f"{where}: {kind} block has unexpected keys {sorted(extra)}")
        if absent:
            bad.append(f"{where}: {kind} block is missing keys {sorted(absent)}")
        if kind == "heading" and block.get("level") != 3:
            bad.append(f"{where}: heading block has level {block.get('level')}, expected 3")
        if kind == "list" and not block.get("items"):
            bad.append(f"{where}: empty list block")
        if kind in ("paragraph", "code") and not block.get("text", "").strip():
            bad.append(f"{where}: empty {kind} block")

    oks.append("block counts: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    results.add("block shapes", oks, bad)


def check_figures(
    book: dict[str, Any], figures_dir: Path, results: Results
) -> None:
    oks: list[str] = []
    bad: list[str] = []

    referenced: Counter = Counter()
    for chapter, topic, block in iter_blocks(book):
        if block["type"] != "figure":
            continue
        src = block["src"]
        if not src.startswith("/figures/"):
            bad.append(f"{chapter['id']}: figure src {src!r} is not under /figures/")
            continue
        name = src[len("/figures/"):]
        referenced[name] += 1
        path = figures_dir / name
        if not path.exists():
            bad.append(f"{chapter['id']}: referenced figure is missing on disk: {name}")
            continue
        try:
            width, height = png_size(path)
        except ValueError as exc:
            bad.append(str(exc))
            continue
        if (width, height) != (block["width"], block["height"]):
            bad.append(
                f"{name}: recorded {block['width']}x{block['height']} "
                f"but the PNG is {width}x{height}"
            )
        if not block.get("alt"):
            bad.append(f"{name}: empty alt text")

    on_disk = {p.name for p in figures_dir.iterdir() if p.is_file()}
    orphans = sorted(on_disk - set(referenced))
    dangling = sorted(set(referenced) - on_disk)
    duplicates = sorted(n for n, c in referenced.items() if c > 1)
    if orphans:
        bad.append(f"{len(orphans)} file(s) in public/figures are never referenced: {orphans[:8]}")
    if dangling:
        bad.append(f"{len(dangling)} referenced figure(s) do not exist: {dangling[:8]}")
    if duplicates:
        bad.append(f"figure referenced more than once: {duplicates[:8]}")

    if referenced and not bad:
        widths = sorted(png_size(figures_dir / n)[0] for n in referenced)
        oks.append(
            f"{len(referenced)} figures, 1:1 with {len(on_disk)} files on disk, no orphans"
        )
        oks.append(
            f"intrinsic widths: min {widths[0]} / median {widths[len(widths) // 2]} / max {widths[-1]}"
        )
    results.add("figures", oks, bad)


def check_roundtrip(
    book: dict[str, Any], doc: "fitz.Document", results: Results, show: int
) -> None:
    """Compare every chapter's extracted text with the raw PDF page range."""
    oks: list[str] = []
    bad: list[str] = []
    total_pdf = total_json = 0

    for chapter in book["chapters"]:
        raw = "".join(
            doc[p].get_text()
            for p in range(chapter["pageStart"] - 1, chapter["pageEnd"])
        )
        expected = squeeze(raw)
        actual = squeeze(chapter_text(chapter))
        total_pdf += len(expected)
        total_json += len(actual)
        if expected == actual:
            continue
        lost, added = char_delta(expected, actual)
        bad.append(
            f"{chapter['id']} (pages {chapter['pageStart']}-{chapter['pageEnd']}): "
            f"pdf {len(expected)} chars vs json {len(actual)} chars; "
            f"lost {sum(lost.values())} {dict(lost.most_common(show))}, "
            f"added {sum(added.values())} {dict(added.most_common(show))}\n"
            f"         {first_divergence(expected, actual)}"
        )

    if not bad:
        oks.append(
            f"all {len(book['chapters'])} chapters are character-identical to the PDF "
            f"({total_pdf} non-whitespace characters compared)"
        )
    else:
        oks.append(f"pdf total {total_pdf} chars, json total {total_json} chars")
    results.add("round-trip fidelity (verbatim text)", oks, bad)


def check_unicode_preserved(book: dict[str, Any], results: Results) -> None:
    """The book's real punctuation must survive, not be flattened to ASCII."""
    oks: list[str] = []
    bad: list[str] = []
    text = "\n".join(block_text(b) for _c, _t, b in iter_blocks(book))
    expected = {
        "\u2019": "right single quote",
        "\u201c": "left double quote",
        "\u201d": "right double quote",
        "\u2013": "en dash",
        "\u2022": "bullet",
    }
    for char, name in expected.items():
        count = text.count(char)
        if count == 0:
            bad.append(f"no {name} ({char!r}) anywhere -- Unicode was probably normalised")
        else:
            oks.append(f"{name} {char!r}: {count}")
    for char in ("\ufffd", "\u00ad"):
        if char in text:
            bad.append(f"replacement/soft-hyphen character {char!r} leaked into the text")
    results.add("Unicode preservation", oks, bad)


def check_no_furniture(book: dict[str, Any], doc: "fitz.Document", results: Results) -> None:
    """No running header, footer or folio may appear inside block prose."""
    oks: list[str] = []
    bad: list[str] = []

    outline_titles = {title for _lvl, title, _pg in doc.get_toc()}
    # A running header repeats on every page it decorates, so only an outline
    # title occurring *more than once* as body text indicates a leak. The book's
    # printed table of contents legitimately lists each title exactly once.
    title_hits: Counter = Counter()
    for _chapter, _topic, block in iter_blocks(book):
        for line in block_text(block).splitlines():
            stripped = line.strip()
            if stripped in outline_titles:
                title_hits[stripped] += 1

    for chapter, topic, block in iter_blocks(book):
        text = block_text(block)
        where = f"{chapter['id']}/{topic['id']}"
        if PAGE_ARTEFACT_RE.search(text):
            bad.append(f"{where}: page-number artefact in {text[:60]!r}")
        for line in text.splitlines():
            stripped = line.strip()
            if re.fullmatch(r"\d{1,4}", stripped):
                bad.append(f"{where}: bare page number as a whole line: {stripped!r}")
            if title_hits.get(stripped, 0) > 1:
                bad.append(
                    f"{where}: outline title appears as body text "
                    f"{title_hits[stripped]} times: {stripped!r}"
                )

    oks.append(
        f"no folios or page-number artefacts; {len(title_hits)} outline titles appear "
        "as body text exactly once each (the book's printed table of contents)"
    )
    results.add("running headers / footers / page numbers", oks, bad)


def check_derived_files(
    book: dict[str, Any], data_dir: Path, results: Results
) -> None:
    oks: list[str] = []
    bad: list[str] = []

    toc = json.loads((data_dir / "toc.json").read_text(encoding="utf-8"))
    search = json.loads((data_dir / "search.json").read_text(encoding="utf-8"))

    if len(toc) != len(book["chapters"]):
        bad.append(f"toc.json has {len(toc)} chapters, book.json has {len(book['chapters'])}")
    for entry, chapter in zip(toc, book["chapters"]):
        for key in ("id", "number", "title", "fullTitle"):
            if entry.get(key) != chapter[key]:
                bad.append(f"toc.json {key} mismatch for {chapter['id']}")
        if [t["id"] for t in entry["topics"]] != [t["id"] for t in chapter["topics"]]:
            bad.append(f"toc.json topic ids differ for {chapter['id']}")

    expected_pairs = [
        (c["id"], t["id"]) for c in book["chapters"] for t in c["topics"]
    ]
    actual_pairs = [(e["chapterId"], e["topicId"]) for e in search]
    if expected_pairs != actual_pairs:
        bad.append("search.json does not cover exactly one entry per topic, in order")
    for entry in search:
        if not isinstance(entry.get("text"), str):
            bad.append(f"search.json entry {entry.get('topicId')!r} has no text")

    oks.append(f"toc.json mirrors book.json ({len(toc)} chapters)")
    oks.append(f"search.json has {len(search)} topic entries")
    results.add("derived files (toc.json, search.json)", oks, bad)


def check_headings_complete(
    book: dict[str, Any], doc: "fitz.Document", results: Results
) -> None:
    """Every heading-like line in the PDF must appear exactly once as a heading.

    Re-reads the fonts straight from the PDF: a line set entirely in bold, or
    set at 13pt or larger, is a heading.  Each must surface as a chapter title,
    a topic title or a level-3 heading block -- never silently as prose, and
    never duplicated.
    """
    oks: list[str] = []
    bad: list[str] = []
    bold = {"LiberationSerif-Bold", "LiberationSerif-BoldItal"}

    pdf_lines: Counter = Counter()
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                spans = [s for s in line["spans"] if s["text"].strip()]
                if not spans:
                    continue
                size = max(s["size"] for s in spans)
                if all(s["font"] in bold for s in spans) or size >= 13.0:
                    pdf_lines[" ".join("".join(s["text"] for s in line["spans"]).split())] += 1

    json_headings: Counter = Counter()
    for chapter in book["chapters"]:
        json_headings[" ".join(chapter["fullTitle"].split())] += 1
        for topic in chapter["topics"]:
            if not topic["isIntro"]:
                json_headings[" ".join(topic["title"].split())] += 1
            for block in topic["blocks"]:
                if block["type"] == "heading":
                    json_headings[" ".join(block["text"].split())] += 1

    # A chapter title that wraps is two lines in the PDF and one string here.
    wrapped = {h for h in json_headings if h not in pdf_lines and h.startswith("CHAPTER")}
    for whole in wrapped:
        for part in list(pdf_lines):
            if part and part in whole:
                del pdf_lines[part]
        del json_headings[whole]

    for text, count in (pdf_lines - json_headings).items():
        bad.append(f"heading in the PDF but not in book.json ({count}x): {text!r}")
    for text, count in (json_headings - pdf_lines).items():
        bad.append(f"heading in book.json but not in the PDF ({count}x): {text!r}")

    oks.append(
        f"{sum(pdf_lines.values()) + len(wrapped)} heading lines in the PDF all appear "
        f"as a chapter title, topic title or level-3 heading "
        f"({len(wrapped)} wrapped chapter titles rejoined)"
    )
    results.add("heading completeness", oks, bad)


def check_topic_sanity(book: dict[str, Any], results: Results) -> None:
    """Chapter 1 must contain the sections a reader would expect to find."""
    oks: list[str] = []
    bad: list[str] = []
    expected = [
        "Single server setup", "Database", "Vertical scaling vs horizontal scaling",
        "Load balancer", "Database replication", "Cache",
        "Content delivery network (CDN)", "Stateless web tier", "Data centers",
        "Message queue", "Logging, metrics, automation", "Database scaling",
        "Millions of users and beyond",
    ]
    chapter = next((c for c in book["chapters"] if c["number"] == 1), None)
    if chapter is None:
        bad.append("no chapter 1 found")
    else:
        titles = {t["title"].strip() for t in chapter["topics"]}
        for want in expected:
            if want not in titles:
                bad.append(f"chapter 1 is missing the expected topic {want!r}")
        oks.append(
            f"chapter 1 has {len(chapter['topics'])} topics including all "
            f"{len(expected)} expected section titles"
        )
    results.add("topic split sanity (chapter 1)", oks, bad)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify src/data against the source PDF and the data contract.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="source PDF")
    parser.add_argument(
        "--data-dir", type=Path, default=REPO_ROOT / "src" / "data", help="JSON directory"
    )
    parser.add_argument(
        "--figures-dir",
        type=Path,
        default=REPO_ROOT / "public" / "figures",
        help="figure directory",
    )
    parser.add_argument(
        "--show", type=int, default=8, help="how many differing characters to list"
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)

    book_path = args.data_dir / "book.json"
    if not book_path.exists():
        print(f"missing {book_path}; run scripts/extract.py first", file=sys.stderr)
        return 2
    book = json.loads(book_path.read_text(encoding="utf-8"))
    doc = fitz.open(args.pdf)

    results = Results()
    check_structure(book, doc, results)
    check_block_shapes(book, results)
    check_figures(book, args.figures_dir, results)
    check_roundtrip(book, doc, results, args.show)
    check_unicode_preserved(book, results)
    check_no_furniture(book, doc, results)
    check_derived_files(book, args.data_dir, results)
    check_headings_complete(book, doc, results)
    check_topic_sanity(book, results)

    print(f"Verifying {book_path} against {args.pdf.name}\n")
    print(results.render())
    return 1 if results.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
