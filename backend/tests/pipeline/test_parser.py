"""Tests for the document parser service (document_parser.py).

Tests cover:
  - PDF parsing (valid + corrupted)
  - TXT parsing (UTF-8 + GBK fallback)
  - MD parsing (plain text extraction)
  - DOCX parsing
  - Error handling (non-existent file, unsupported type, empty file)
"""

from pathlib import Path

import pytest

from app.services.document_parser import DocumentParsedResult, parse_document


# ═════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════


def _assert_success(result: DocumentParsedResult) -> None:
    """Assert that a parse result represents successful extraction."""
    assert result.error is None, f"Expected no error, got: {result.error}"
    assert isinstance(result.text, str), "text must be a string"
    assert isinstance(result.metadata, dict), "metadata must be a dict"


def _assert_error(result: DocumentParsedResult) -> None:
    """Assert that a parse result represents a handled failure."""
    assert result.error is not None, "Expected an error message"
    assert isinstance(result.error, str), "error must be a string"
    assert result.text == "", "text must be empty on error"
    assert result.page_count == 0, "page_count must be 0 on error"


# ═════════════════════════════════════════════════════════════════════════
# PDF parsing
# ═════════════════════════════════════════════════════════════════════════


class TestPdfParsing:
    """Tests for PDF document parsing via docling."""

    @pytest.mark.asyncio
    async def test_valid_pdf_returns_text_and_page_count(
        self, sample_pdf_file: str
    ) -> None:
        """Valid PDF should return non-empty text and page_count > 0."""
        result = await parse_document(sample_pdf_file)

        _assert_success(result)
        assert len(result.text) > 0, "PDF text should not be empty"
        assert result.page_count > 0, "PDF page_count should be > 0"
        assert result.file_type == ".pdf"

    @pytest.mark.asyncio
    async def test_corrupted_pdf_returns_error(self, tmp_path: Path) -> None:
        """Corrupted PDF should return an error without crashing."""
        file_path = tmp_path / "corrupted.pdf"
        file_path.write_bytes(b"this is not a valid pdf file content")

        result = await parse_document(str(file_path))

        _assert_error(result)
        assert result.file_type == ".pdf"


# ═════════════════════════════════════════════════════════════════════════
# Plain text parsing (TXT / MD)
# ═════════════════════════════════════════════════════════════════════════


class TestPlainTextParsing:
    """Tests for plain text document parsing (TXT and MD files)."""

    @pytest.mark.asyncio
    async def test_txt_utf8_parsing(self, sample_txt_file: str) -> None:
        """UTF-8 encoded .txt file should be parsed correctly."""
        result = await parse_document(sample_txt_file)

        _assert_success(result)
        assert "机器学习" in result.text, "Should contain the Chinese content"
        assert result.page_count == 1, "TXT files always have page_count=1"
        assert result.file_type == ".txt"
        assert "filename" in result.metadata
        assert "size_bytes" in result.metadata

    @pytest.mark.asyncio
    async def test_txt_gbk_fallback(self, tmp_path: Path) -> None:
        """GBK-encoded .txt file should be decoded via fallback encoding."""
        file_path = tmp_path / "gbk_test.txt"
        gbk_content = "机器学习测试内容GBK编码".encode("gbk")
        file_path.write_bytes(gbk_content)

        result = await parse_document(str(file_path))

        _assert_success(result)
        assert "机器学习" in result.text, (
            "GBK content should be decoded correctly"
        )
        assert result.page_count == 1
        assert result.file_type == ".txt"

    @pytest.mark.asyncio
    async def test_md_parsing(self, tmp_path: Path) -> None:
        """.md files are read as plain text — markdown syntax is preserved."""
        file_path = tmp_path / "test.md"
        md_content = (
            "# 机器学习入门\n\n"
            "## 监督学习\n\n"
            "监督学习是机器学习的一个重要分支。\n\n"
            "- 分类\n"
            "- 回归\n"
        )
        file_path.write_text(md_content, encoding="utf-8")

        result = await parse_document(str(file_path))

        _assert_success(result)
        assert len(result.text) > 0, "MD text should not be empty"
        assert "监督学习" in result.text, (
            "Should contain the original markdown content"
        )
        assert result.page_count == 1, "MD files always have page_count=1"
        assert result.file_type == ".md"

    @pytest.mark.asyncio
    async def test_empty_file_no_crash(self, tmp_path: Path) -> None:
        """Empty file should not crash — returns empty text, no error."""
        file_path = tmp_path / "empty.txt"
        file_path.write_text("", encoding="utf-8")

        result = await parse_document(str(file_path))

        # Empty file is not an error — just no content
        assert result.error is None, (
            "Empty file should not produce an error"
        )
        assert result.text == "", "Empty file should have empty text"
        assert result.page_count == 1, "Plain text always has page_count=1"
        assert result.file_type == ".txt"
        assert "filename" in result.metadata


# ═════════════════════════════════════════════════════════════════════════
# DOCX parsing
# ═════════════════════════════════════════════════════════════════════════


class TestDocxParsing:
    """Tests for DOCX document parsing via docling."""

    @pytest.mark.asyncio
    async def test_valid_docx_returns_text(self, sample_docx_file: str) -> None:
        """Valid DOCX should return non-empty text."""
        result = await parse_document(sample_docx_file)

        _assert_success(result)
        assert len(result.text) > 0, "DOCX text should not be empty"
        assert result.file_type == ".docx"


# ═════════════════════════════════════════════════════════════════════════
# Error handling
# ═════════════════════════════════════════════════════════════════════════


class TestErrorHandling:
    """Tests for error handling in parse_document."""

    @pytest.mark.asyncio
    async def test_nonexistent_file_returns_error(self) -> None:
        """Non-existent file should return error with text empty."""
        result = await parse_document("/nonexistent/path/file.pdf")

        _assert_error(result)
        assert "File not found" in result.error
        assert result.metadata == {}

    @pytest.mark.asyncio
    async def test_unsupported_file_type_returns_error(
        self, sample_unsupported_file: str
    ) -> None:
        """Unsupported file extension (.exe) should return error."""
        result = await parse_document(sample_unsupported_file)

        _assert_error(result)
        assert "Unsupported file type" in result.error
        assert result.file_type == ".exe"
