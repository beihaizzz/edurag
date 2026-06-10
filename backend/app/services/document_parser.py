"""Document parser using docling for PDF/DOCX/PPTX and plain text for TXT/MD."""

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

from docling.document_converter import DocumentConverter

logger = logging.getLogger(__name__)

# ── Supported file types ────────────────────────────────────────────────
_PLAIN_TEXT_EXTENSIONS: frozenset[str] = frozenset({".txt", ".md"})
_DOCLING_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".docx", ".pptx"})


@dataclass
class DocumentParsedResult:
    """Result of parsing a document file.

    Attributes:
        text: Extracted text content. Empty string on error.
        metadata: Additional metadata extracted from the document
                  (filename, size_bytes, etc.).
        page_count: Number of pages. 0 for plain text or on error;
                    1 for TXT/MD.
        file_type: Lowercase file extension including dot (e.g. ".pdf").
        error: Error message if parsing failed, None otherwise.
    """

    text: str
    metadata: dict
    page_count: int
    file_type: str
    error: str | None = None


async def parse_document(file_path: str) -> DocumentParsedResult:
    """Parse a document file to extract its text content.

    Supported formats:
        - PDF, DOCX, PPTX  →  parsed via docling DocumentConverter
        - TXT, MD          →  read as plain UTF-8 text (GBK fallback)

    Args:
        file_path: Absolute or relative path to the document file.

    Returns:
        ``DocumentParsedResult`` with extracted text and metadata.
        On any failure the *error* field is populated, *text* is empty,
        and the function **never raises**.
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    try:
        if not path.is_file():
            return DocumentParsedResult(
                text="",
                metadata={},
                page_count=0,
                file_type=ext,
                error=f"File not found: {file_path}",
            )

        if ext in _PLAIN_TEXT_EXTENSIONS:
            return await _parse_plain_text(path, ext)

        if ext in _DOCLING_EXTENSIONS:
            return await _parse_with_docling(path, ext)

        return DocumentParsedResult(
            text="",
            metadata={},
            page_count=0,
            file_type=ext,
            error=f"Unsupported file type: {ext}",
        )

    except Exception:
        logger.exception("Unexpected error parsing document: %s", file_path)
        return DocumentParsedResult(
            text="",
            metadata={},
            page_count=0,
            file_type=ext,
            error=f"Unexpected error parsing document: {file_path}",
        )


# ═════════════════════════════════════════════════════════════════════════
#  Internal helpers
# ═════════════════════════════════════════════════════════════════════════


async def _parse_plain_text(path: Path, ext: str) -> DocumentParsedResult:
    """Read .txt / .md files as plain text (UTF-8, with GBK fallback)."""
    try:
        text = await asyncio.to_thread(path.read_text, encoding="utf-8")
        logger.info(
            "Parsed plain text file: %s (%d chars)", path.name, len(text)
        )
    except UnicodeDecodeError:
        try:
            text = await asyncio.to_thread(path.read_text, encoding="gbk")
            logger.info(
                "Parsed plain text file (GBK fallback): %s (%d chars)",
                path.name, len(text),
            )
        except Exception as exc:
            logger.error("Failed to decode text file: %s", path.name)
            return DocumentParsedResult(
                text="",
                metadata={"filename": path.name},
                page_count=0,
                file_type=ext,
                error=f"Failed to decode file: {exc}",
            )
    except Exception as exc:
        logger.error("Failed to read text file: %s – %s", path.name, exc)
        return DocumentParsedResult(
            text="",
            metadata={"filename": path.name},
            page_count=0,
            file_type=ext,
            error=str(exc),
        )

    return DocumentParsedResult(
        text=text,
        metadata={
            "filename": path.name,
            "size_bytes": path.stat().st_size,
        },
        page_count=1,
        file_type=ext,
    )


async def _parse_with_docling(path: Path, ext: str) -> DocumentParsedResult:
    """Parse PDF / DOCX / PPTX using docling's DocumentConverter.

    The synchronous converter runs inside ``asyncio.to_thread`` to avoid
    blocking the event loop.
    """
    try:
        converter = DocumentConverter()
        result = await asyncio.to_thread(converter.convert, str(path))

        if result is None or result.document is None:
            return DocumentParsedResult(
                text="",
                metadata={"filename": path.name},
                page_count=0,
                file_type=ext,
                error="Docling returned no content",
            )

        doc = result.document
        text = doc.export_to_text() or ""

        # ── page count ────────────────────────────────────────────
        page_count = 0
        try:
            # docling v2 exposes .pages as a dict – len() gives page count
            pages = doc.pages
            if isinstance(pages, dict):
                page_count = len(pages)
            elif hasattr(pages, "__len__"):
                page_count = len(pages)
        except Exception:
            logger.debug("Could not determine page count for %s", path.name)

        # ── metadata ──────────────────────────────────────────────
        metadata: dict = {
            "filename": path.name,
            "size_bytes": path.stat().st_size,
        }
        # extract title / author if available
        for attr in ("name", "title"):
            if hasattr(doc, attr):
                val = getattr(doc, attr, None)
                if val and isinstance(val, str):
                    metadata["title"] = val
                    break

        logger.info(
            "Parsed document with docling: %s (%d chars, %d pages)",
            path.name, len(text), page_count,
        )
        return DocumentParsedResult(
            text=text,
            metadata=metadata,
            page_count=page_count,
            file_type=ext,
        )

    except Exception as exc:
        logger.exception("Docling parsing failed for: %s", path.name)
        return DocumentParsedResult(
            text="",
            metadata={"filename": path.name},
            page_count=0,
            file_type=ext,
            error=f"Docling parsing error: {exc}",
        )
