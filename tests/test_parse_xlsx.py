"""Tests for the row-group XLSX parser.

The old parser concatenated every row of a sheet into one giant text
blob, then RecursiveCharacterTextSplitter shredded it into tens of
thousands of ~500-char fragments with arbitrary row boundaries. That
both exploded embed/store time on real workbooks and produced useless
retrieval hits. The new parser emits row-group chunks bounded by
``CHUNK_SIZE`` so chunk count is proportional to content volume, not
row count, and row boundaries are preserved.
"""

from pathlib import Path

import pytest

from ylj.config import CHUNK_SIZE
from ylj.documents import parse_xlsx

openpyxl = pytest.importorskip("openpyxl")


def _make_xlsx(path: Path, sheets: dict[str, list[list]]):
    """Write a multi-sheet workbook with the given `{name: rows}` shape."""
    wb = openpyxl.Workbook()
    default = wb.active
    wb.remove(default)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for row in rows:
            ws.append(row)
    wb.save(path)


def test_single_small_sheet_produces_one_chunk(tmp_path):
    p = tmp_path / "small.xlsx"
    _make_xlsx(p, {"Sheet1": [["a", "b"], ["c", "d"]]})

    chunks = parse_xlsx(p)

    assert len(chunks) == 1
    assert chunks[0].source == f"{p} [Sheet1]"
    assert chunks[0].source_file == str(p)
    # Both rows made it into the single chunk.
    assert "a | b" in chunks[0].text
    assert "c | d" in chunks[0].text


def test_row_groups_respect_chunk_size_and_preserve_row_boundaries(tmp_path):
    """A sheet big enough to span multiple chunks must still split on
    row boundaries — never mid-row."""
    p = tmp_path / "big.xlsx"
    # Each row is ~60 chars ("value_of_row_NNNN | ..."). With CHUNK_SIZE=500
    # that's ~8 rows per chunk.
    rows = [[f"value_of_row_{i:04d}", f"other_{i:04d}", f"third_{i:04d}"] for i in range(200)]
    _make_xlsx(p, {"Sheet1": rows})

    chunks = parse_xlsx(p)

    # Far fewer chunks than rows.
    assert 1 < len(chunks) < len(rows), (
        f"expected row-group chunks; got {len(chunks)} for {len(rows)} rows"
    )
    # Every chunk is made of whole lines — no row was split mid-way.
    for c in chunks:
        for line in c.text.split("\n"):
            assert " | " in line or line == "", f"mid-row split detected: {line!r}"

    # All chunks share the same source labels.
    assert all(c.source == f"{p} [Sheet1]" for c in chunks)
    assert all(c.source_file == str(p) for c in chunks)


def test_row_group_chunks_are_bounded_in_size(tmp_path):
    """No chunk should be dramatically larger than CHUNK_SIZE — at most
    one extra row's worth (the row that tipped us over the threshold)."""
    p = tmp_path / "dense.xlsx"
    rows = [[f"col_{i}_{j}" for j in range(5)] for i in range(500)]
    _make_xlsx(p, {"Data": rows})

    chunks = parse_xlsx(p)

    # Allow a generous overshoot for the trailing row that crosses CHUNK_SIZE.
    per_chunk_limit = CHUNK_SIZE * 2
    for c in chunks:
        assert len(c.text) <= per_chunk_limit, (
            f"chunk {len(c.text)} chars exceeds 2x CHUNK_SIZE ({per_chunk_limit})"
        )


def test_empty_rows_are_skipped(tmp_path):
    p = tmp_path / "sparse.xlsx"
    _make_xlsx(p, {"Sheet1": [
        ["alpha"],
        [None, None, None],
        [],
        ["beta"],
    ]})

    chunks = parse_xlsx(p)

    assert len(chunks) == 1
    body = chunks[0].text.split("\n")
    assert "alpha" in body
    assert "beta" in body
    assert "" not in body


def test_multiple_sheets_produce_per_sheet_chunks(tmp_path):
    p = tmp_path / "multi.xlsx"
    _make_xlsx(p, {
        "Hidden": [["h1", "h2"]],
        "Data":   [["d1", "d2"]],
    })

    chunks = parse_xlsx(p)

    sources = [c.source for c in chunks]
    assert f"{p} [Hidden]" in sources
    assert f"{p} [Data]" in sources
    # source_file is always the clean path — no [sheet] suffix — so
    # incremental ingest can delete-by-source-file across all sheets
    # of a modified workbook in one call.
    assert all(c.source_file == str(p) for c in chunks)


def test_empty_sheet_produces_no_chunk(tmp_path):
    p = tmp_path / "empty.xlsx"
    _make_xlsx(p, {"Sheet1": []})

    chunks = parse_xlsx(p)

    assert chunks == []


def test_realistic_row_explosion_is_capped(tmp_path):
    """Regression guard: a dense workbook must not produce an
    orders-of-magnitude chunk explosion like the old parser did.

    A sheet with ~1,000 rows of realistic-looking row text (averaging
    ~80 chars each) is ~80 KB of text. At CHUNK_SIZE=500 that's at
    most ~200 chunks — not thousands.
    """
    p = tmp_path / "realistic.xlsx"
    rows = [[
        f"europe-bench-{i:04d}", "region-eu-west", "2025-04", f"{100 + i}",
        "pending review", "internal use only — do not share",
    ] for i in range(1000)]
    _make_xlsx(p, {"Sheet1": rows})

    chunks = parse_xlsx(p)

    assert len(chunks) < 500, f"row-group chunking must cap output; got {len(chunks)}"
