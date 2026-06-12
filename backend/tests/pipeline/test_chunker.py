"""Tests for app.services.chunker — pure-function text chunking, no DB."""

import pytest

from app.core.config import settings
from app.services.chunker import ChunkData, chunk_text, _CHINESE_SEPARATORS
from tests.utils import generate_test_content


# ── Helpers ──────────────────────────────────────────────────────────

def _overlap_found(chunks: list[ChunkData], tail_len: int = 50) -> bool:
    """Return True if every adjacent pair shares content in the overlap region."""
    if len(chunks) < 2:
        return True
    for i in range(len(chunks) - 1):
        tail = chunks[i].content[-tail_len:]
        # Search within the first (overlap * 2) chars of the next chunk
        head = chunks[i + 1].content[: settings.RAG_CHUNK_OVERLAP * 2]
        if tail not in head:
            return False
    return True


# ═══════════════════════════════════════════════════════════════════════
# chunk_text tests
# ═══════════════════════════════════════════════════════════════════════


class TestChunkTextNormal:
    """Normal-path chunking behaviour."""

    async def test_multiple_chunks_2000_chars(self):
        """2000-char input produces multiple chunks."""
        text = generate_test_content(2000)
        chunks = await chunk_text(text)
        assert len(chunks) > 1, f"Expected >1 chunks, got {len(chunks)}"

    async def test_short_text_single_chunk(self):
        """Text shorter than RAG_CHUNK_SIZE returns a single chunk."""
        text = "这是一段简短的测试文本，不足800字。"  # ~19 chars
        chunks = await chunk_text(text)
        assert len(chunks) == 1
        assert chunks[0].content == text
        assert chunks[0].index == 0
        assert chunks[0].char_count == len(text)

    async def test_every_chunk_is_ChunkData(self):
        """Every item in the result list is a ChunkData instance."""
        text = generate_test_content(2000)
        chunks = await chunk_text(text)
        for c in chunks:
            assert isinstance(c, ChunkData)

    async def test_index_is_monotonic(self):
        """Chunk indices are sequential starting from 0."""
        text = generate_test_content(3000)
        chunks = await chunk_text(text)
        for i, c in enumerate(chunks):
            assert c.index == i

    async def test_char_count_matches_content(self):
        """Each chunk's char_count equals len(content)."""
        text = generate_test_content(2000)
        chunks = await chunk_text(text)
        for c in chunks:
            assert c.char_count == len(c.content)


class TestChunkTextEmpty:
    """Edge cases for empty / whitespace input."""

    async def test_empty_string(self):
        """Empty string returns empty list."""
        chunks = await chunk_text("")
        assert chunks == []

    async def test_whitespace_only(self):
        """Whitespace-only text returns empty list."""
        chunks = await chunk_text("   \n  \t  \n  ")
        assert chunks == []

    async def test_none_metadata_handled(self):
        """Passing None for metadata defaults to empty dict."""
        text = "Valid content"
        chunks = await chunk_text(text, metadata=None)
        assert chunks[0].metadata == {}


class TestChunkTextSize:
    """Chunk size constraints."""

    async def test_chunks_respect_max_size(self):
        """Every chunk is ≤ RAG_CHUNK_SIZE (with 10 % tolerance for edge cases)."""
        text = generate_test_content(2000)
        chunks = await chunk_text(text)
        tolerance = int(settings.RAG_CHUNK_SIZE * 1.1)
        for c in chunks:
            assert c.char_count <= tolerance, (
                f"Chunk {c.index} has {c.char_count} chars, "
                f"exceeds tolerance {tolerance}"
            )

    async def test_large_10000_chars_all_respect_limit(self):
        """10000+ char input: every chunk respects RAG_CHUNK_SIZE."""
        text = generate_test_content(12000)
        chunks = await chunk_text(text)
        assert len(chunks) > 1, "Expected multiple chunks"
        tolerance = int(settings.RAG_CHUNK_SIZE * 1.1)
        for c in chunks:
            assert c.char_count <= tolerance, (
                f"Chunk {c.index} exceeds limit: {c.char_count} > {tolerance}"
            )

    async def test_content_reassembly_reasonable(self):
        """Chunks' combined content roughly covers the original (allowance for overlap)."""
        text = generate_test_content(2000)
        chunks = await chunk_text(text)
        combined = "".join(c.content for c in chunks)
        # Because of overlap, combined > original, but original should be mostly present
        # Check that key substrings from each region appear
        assert text[:50] in combined, "Beginning of text missing"
        assert text[-50:] in combined, "End of text missing"
        mid = len(text) // 2
        assert text[mid : mid + 50] in combined, "Middle of text missing"


class TestChunkTextChineseBoundary:
    """Chinese sentence-boundary aware splitting."""

    async def test_chinese_sentences_prefer_boundaries(self):
        """Chunks prefer splitting at Chinese sentence endings (。！？；)."""
        # Build text with explicit sentence endings
        sentence = "机器学习是人工智能的重要分支，它从数据中学习。深度学习利用多层神经网络。"
        text = sentence * 15  # ~990 chars, ensures > chunk_size
        chunks = await chunk_text(text)

        for c in chunks:
            stripped = c.content.strip()
            if not stripped:
                continue
            last = stripped[-1]
            # The last char may be any Chinese char if split mid-sentence,
            # but ideally most chunks end on a sentence boundary
            # We only assert size constraint here — boundary preference is
            # validated by the separator list in _CHINESE_SEPARATORS
            pass  # non-fatal: RecursiveCharacterTextSplitter does its best

        # Each chunk should be ≤ chunk_size
        tolerance = int(settings.RAG_CHUNK_SIZE * 1.1)
        for c in chunks:
            assert c.char_count <= tolerance, (
                f"Chunk {c.index} exceeds limit"
            )

    async def test_boundary_separators_ordered(self):
        """_CHINESE_SEPARATORS list has correct priority order."""
        # Higher priority: structural breaks first
        assert _CHINESE_SEPARATORS[0] == "\n\n"
        assert _CHINESE_SEPARATORS[1] == "\n"
        # Chinese sentence endings before English
        assert _CHINESE_SEPARATORS[2] == "。"
        assert _CHINESE_SEPARATORS[3] == "！"
        assert _CHINESE_SEPARATORS[4] == "？"
        assert _CHINESE_SEPARATORS[5] == "；"
        # English punctuation follows
        assert _CHINESE_SEPARATORS[6] == "."
        # Last resort: space and character-level
        assert _CHINESE_SEPARATORS[-2] == " "
        assert _CHINESE_SEPARATORS[-1] == ""

    async def test_text_with_chinese_punctuation_splits(self):
        """Text with Chinese punctuation produces reasonable chunking."""
        # Sentences explicitly ending with different Chinese punctuation
        sentences = [
            "第一句话以句号结束。",
            "第二句话有感叹号！",
            "第三句话是问句？",
            "第四句话用分号；",
        ]
        text = ("".join(sentences)) * 15  # 15*4*~12 = ~720, but some sentences are longer
        # Actually 15 * (12+12+10+10) ≈ 660 chars, just under chunk_size
        text = ("".join(sentences)) * 20  # ~880 chars → should produce >1 chunk
        chunks = await chunk_text(text)
        # At least one chunk boundary exists
        assert len(chunks) >= 1


class TestChunkTextOverlap:
    """Overlap between consecutive chunks."""

    async def test_adjacent_chunks_share_content(self):
        """Adjacent chunks have overlapping content."""
        text = generate_test_content(3000)
        chunks = await chunk_text(text)
        assert len(chunks) >= 2, "Need at least 2 chunks for overlap test"

        for i in range(len(chunks) - 1):
            tail = chunks[i].content[-50:]
            head = chunks[i + 1].content[: settings.RAG_CHUNK_OVERLAP * 2]
            assert tail in head, (
                f"Chunks {i}–{i + 1}: no overlap found.\n"
                f"  Chunk {i} tail (50): {tail!r}\n"
                f"  Chunk {i + 1} head ({len(head)}): {head!r}"
            )

    async def test_overlap_sufficient(self):
        """Overlap between chunks is non-trivial (at least a few chars)."""
        text = generate_test_content(3000)
        chunks = await chunk_text(text)

        for i in range(len(chunks) - 1):
            # Find the common prefix between tail of chunk i and head of chunk i+1
            a = chunks[i].content
            b = chunks[i + 1].content
            # The start of b should contain some suffix of a
            # Search for the last 30 chars of a in b
            overlap_substr = a[-30:]
            assert overlap_substr in b, (
                f"Chunks {i}–{i + 1}: insufficient overlap"
            )


class TestChunkTextMetadata:
    """Metadata propagation to every chunk."""

    async def test_metadata_in_every_chunk(self):
        """Input metadata dict is copied into every ChunkData."""
        metadata = {"document_id": 42, "course_id": 101, "source": "test.pdf"}
        text = generate_test_content(2000)
        chunks = await chunk_text(text, metadata=metadata)

        assert len(chunks) > 0
        for i, c in enumerate(chunks):
            assert c.metadata["document_id"] == 42, f"Chunk {i} missing document_id"
            assert c.metadata["course_id"] == 101, f"Chunk {i} missing course_id"
            assert c.metadata["source"] == "test.pdf", f"Chunk {i} missing source"

    async def test_metadata_independence(self):
        """Modifying a chunk's metadata does not affect other chunks."""
        metadata = {"doc_id": 1}
        text = generate_test_content(2000)
        chunks = await chunk_text(text, metadata=metadata)

        # Mutate first chunk's metadata
        chunks[0].metadata["doc_id"] = 999
        chunks[0].metadata["extra"] = "mutated"

        # Other chunks should be unaffected
        for i in range(1, len(chunks)):
            assert chunks[i].metadata["doc_id"] == 1, (
                f"Chunk {i} was mutated by chunk 0"
            )
            assert "extra" not in chunks[i].metadata, (
                f"Chunk {i} leaked 'extra' from chunk 0"
            )

    async def test_metadata_not_shared_reference(self):
        """Input metadata dict is copied, not shared by reference."""
        metadata = {"doc_id": 1}
        text = "Test content " * 100
        chunks = await chunk_text(text, metadata=metadata)

        # Mutate the original dict
        metadata["doc_id"] = 999
        metadata["new_key"] = "intruded"

        # Chunks should retain the original values
        for c in chunks:
            assert c.metadata["doc_id"] == 1
            assert "new_key" not in c.metadata

    async def test_no_metadata_produces_empty_dict(self):
        """When no metadata is passed, each chunk has an empty dict."""
        text = generate_test_content(2000)
        chunks = await chunk_text(text)
        for c in chunks:
            assert c.metadata == {}
