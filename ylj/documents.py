"""Document parsing and chunking."""

from dataclasses import dataclass
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from ylj.config import CHUNK_OVERLAP, CHUNK_SIZE

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".csv"}

# Directories to skip during recursive scanning
SKIP_DIRS = {
    "node_modules", ".git", ".venv", "venv", "__pycache__", ".tox", ".nox",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", "dist", "build",
    ".eggs", "*.egg-info", ".venv-openwebui", "qdrant_data",
    "mlruns", "mlflow", "artifacts", ".ipynb_checkpoints",
}


@dataclass
class Chunk:
    text: str
    source: str
    page: int | None = None


def parse_pdf(path: Path) -> list[Chunk]:
    from pypdf import PdfReader

    reader = PdfReader(path)
    chunks = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text and text.strip():
            chunks.append(Chunk(text=text.strip(), source=str(path), page=i + 1))
    return chunks


def parse_docx(path: Path) -> list[Chunk]:
    from docx import Document

    doc = Document(path)
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    if not text:
        return []
    return [Chunk(text=text, source=str(path))]


def parse_xlsx(path: Path) -> list[Chunk]:
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    chunks = []
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        rows = []
        for row in ws.iter_rows(values_only=True):
            row_text = " | ".join(str(c) for c in row if c is not None)
            if row_text.strip():
                rows.append(row_text)
        if rows:
            chunks.append(Chunk(text="\n".join(rows), source=f"{path} [{sheet}]"))
    return chunks


def parse_pptx(path: Path) -> list[Chunk]:
    from pptx import Presentation

    prs = Presentation(path)
    chunks = []
    for i, slide in enumerate(prs.slides):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                texts.append(shape.text_frame.text)
        text = "\n".join(t for t in texts if t.strip())
        if text:
            chunks.append(Chunk(text=text, source=str(path), page=i + 1))
    return chunks


def parse_text(path: Path) -> list[Chunk]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if not text.strip():
        return []
    return [Chunk(text=text.strip(), source=str(path))]


PARSERS = {
    ".pdf": parse_pdf,
    ".docx": parse_docx,
    ".xlsx": parse_xlsx,
    ".pptx": parse_pptx,
    ".txt": parse_text,
    ".md": parse_text,
    ".csv": parse_text,
}


def parse_document(path: Path) -> list[Chunk]:
    """Parse a document into raw chunks based on file type."""
    parser = PARSERS.get(path.suffix.lower())
    if parser is None:
        print(f"Skipping unsupported file: {path}")
        return []
    return parser(path)


def split_chunks(chunks: list[Chunk]) -> list[Chunk]:
    """Split raw chunks into smaller pieces for embedding."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    result = []
    for chunk in chunks:
        splits = splitter.split_text(chunk.text)
        for split in splits:
            result.append(Chunk(text=split, source=chunk.source, page=chunk.page))
    return result


def _should_skip(path: Path) -> bool:
    """Check if any parent directory is in the skip list."""
    return any(part in SKIP_DIRS or part.endswith(".egg-info") for part in path.parts)


def load_documents(directory: Path) -> list[Chunk]:
    """Load and chunk all supported documents from a directory."""
    all_chunks = []
    for path in sorted(directory.rglob("*")):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS and not _should_skip(path):
            print(f"Processing: {path}")
            raw = parse_document(path)
            chunked = split_chunks(raw)
            all_chunks.extend(chunked)
            print(f"  -> {len(chunked)} chunks")
    print(f"Total chunks: {len(all_chunks)}")
    return all_chunks
