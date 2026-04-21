"""Guard that the onboarding file-types screen stays in sync with the
backend parser registry.

Step 04 of the wizard lets the user toggle categories of files to be
indexed. The server takes the intersection of UI-enabled extensions and
``ylj.documents.PARSERS.keys()`` — so any extension the UI advertises
without a backend parser gets silently dropped at ingest time, and any
parser the backend ships without a UI toggle is invisible to users.

This test reads the live ``FILETYPES`` declaration out of
``ylj/static/src/data.jsx`` and asserts both directions of the bijection.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from ylj.documents import PARSERS, UNSUPPORTED_EXTENSIONS

_DATA_JSX = Path(__file__).resolve().parent.parent / "ylj" / "static" / "src" / "data.jsx"


def _extract_extensions_from_const(const_name: str) -> set[str]:
    """Pull every ``extensions: [...]`` entry out of ``const <name> = [ ... ];``.

    We parse the literal list directly rather than running Babel — the
    blocks are stable and regex-matchable, and this test has to run in
    the Python-only CI env.
    """
    text = _DATA_JSX.read_text(encoding="utf-8")
    marker = f"const {const_name}"
    start = text.find(marker)
    if start < 0:
        pytest.fail(f"{const_name} declaration not found in data.jsx")
    # Grab the array body; declaration closes with a `];` on its own line.
    end = text.find("];", start)
    if end < 0:
        pytest.fail(f"{const_name} closing `];` not found")
    body = text[start:end]
    exts: set[str] = set()
    for match in re.finditer(r"extensions:\s*\[([^\]]*)\]", body):
        for tok in re.findall(r"'([^']+)'", match.group(1)):
            exts.add(tok.lower())
    if not exts:
        pytest.fail(f"No extensions parsed out of {const_name} — regex broke?")
    return exts


def _extract_filetypes_extensions() -> set[str]:
    return _extract_extensions_from_const("FILETYPES")


def _extract_unsupported_filetypes_extensions() -> set[str]:
    return _extract_extensions_from_const("UNSUPPORTED_FILETYPES")


def test_every_ui_extension_has_a_backend_parser():
    """UI toggles only matter when the backend knows how to parse them."""
    ui = _extract_filetypes_extensions()
    parsers = {k.lower() for k in PARSERS.keys()}
    orphans = ui - parsers
    assert not orphans, (
        f"UI advertises extensions the backend can't parse (silently dropped at "
        f"ingest): {sorted(orphans)}. Add parsers in ylj/documents.py::PARSERS "
        f"or remove these from FILETYPES in ylj/static/src/data.jsx."
    )


def test_every_backend_parser_has_a_ui_toggle():
    """Every file type the backend parses should be user-controllable."""
    ui = _extract_filetypes_extensions()
    parsers = {k.lower() for k in PARSERS.keys()}
    hidden = parsers - ui
    assert not hidden, (
        f"Backend parses extensions the UI doesn't expose (users can't "
        f"toggle them): {sorted(hidden)}. Add a category in FILETYPES in "
        f"ylj/static/src/data.jsx or remove the parser from "
        f"ylj/documents.py::PARSERS."
    )


def test_unsupported_ui_matches_backend_constant():
    """The wizard's "not indexed" block must list exactly the extensions
    the backend counts as unsupported — otherwise either step-04 shows
    categories step-07 never reports on, or step-07 reports counts the
    user has no way to understand."""
    ui = _extract_unsupported_filetypes_extensions()
    backend = {e.lower() for e in UNSUPPORTED_EXTENSIONS}
    assert ui == backend, (
        f"UNSUPPORTED_FILETYPES in data.jsx must match "
        f"documents.UNSUPPORTED_EXTENSIONS exactly. "
        f"UI only: {sorted(ui - backend)}. Backend only: {sorted(backend - ui)}."
    )


def test_supported_and_unsupported_are_disjoint():
    """An extension can't be both parseable and known-unsupported — that
    would make the 'unsupported' label a lie."""
    parsers = {k.lower() for k in PARSERS.keys()}
    backend_unsupported = {e.lower() for e in UNSUPPORTED_EXTENSIONS}
    overlap = parsers & backend_unsupported
    assert not overlap, (
        f"Extensions present in both PARSERS and UNSUPPORTED_EXTENSIONS: "
        f"{sorted(overlap)}. Pick one."
    )
