"""Document-related test fixtures.

Provides sample files (TXT, PDF, DOCX, large, unsupported) and
higher-order fixtures for uploading, approving, and processing
documents through the real API.

Fixtures:
    sample_txt_file           - .txt with ~500 chars of Chinese academic content
    sample_pdf_file           - minimal valid .pdf via raw PDF bytes
    sample_docx_file          - minimal valid .docx via zipfile
    sample_large_file         - file exceeding MAX_UPLOAD_SIZE_MB (413 testing)
    sample_unsupported_file   - .exe file (unsupported-extension testing)
    uploaded_document         - POST /api/v1/documents → response JSON
    approved_document         - approve uploaded doc via admin → approved doc
    processed_document        - process + approve → fully processed doc
"""

import io
import os
import zipfile
from pathlib import Path

import pytest
import pytest_asyncio

from app.core.config import settings


# ── Constants ──────────────────────────────────────────────────────────

_CHINESE_CONTENT = """\
机器学习是人工智能的一个重要分支，它通过算法让计算机从数据中学习规律和模式。
监督学习、无监督学习和强化学习是机器学习的主要学习范式。
在监督学习中，模型通过已标注的训练数据学习输入到输出的映射关系。
常见的监督学习算法包括线性回归、逻辑回归、决策树、支持向量机和神经网络。
无监督学习则在没有标签的数据中发现隐藏的结构，如聚类分析和降维技术。
深度学习是机器学习的一个子领域，使用多层神经网络来学习数据的层次化特征表示。
卷积神经网络在图像识别任务中表现出色，而循环神经网络适合处理序列数据。
近年来，Transformer架构在自然语言处理领域取得了突破性进展，BERT和GPT系列模型成为主流。
强化学习通过智能体与环境的交互来学习最优策略，在游戏和机器人控制中应用广泛。
迁移学习允许将在源任务上学到的知识应用到目标任务上，减少了训练数据的需求。
模型评估是机器学习流程中的关键步骤，常用的指标包括准确率、精确率、召回率和F1分数。
"""

_MINIMAL_PDF = r"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF"""


# ── Low-level file fixtures ────────────────────────────────────────────


@pytest.fixture
def sample_txt_file(tmp_path: Path) -> str:
    """Create a .txt file with ~500 chars of Chinese academic content.

    Returns:
        str: Absolute path to the created file.
    """
    file_path = tmp_path / "test_machine_learning.txt"
    file_path.write_text(_CHINESE_CONTENT, encoding="utf-8")
    return str(file_path)


@pytest.fixture
def sample_pdf_file(tmp_path: Path) -> str:
    """Create a minimal valid .pdf file using raw PDF bytes.

    No external library required — the PDF syntax is minimal but
    passes most PDF parsers' structural checks.

    Returns:
        str: Absolute path to the created file.
    """
    file_path = tmp_path / "test.pdf"
    file_path.write_text(_MINIMAL_PDF)
    return str(file_path)


@pytest.fixture
def sample_docx_file(tmp_path: Path) -> str:
    """Create a minimal valid .docx file.

    A .docx is a ZIP archive containing Office Open XML files.
    This fixture builds the minimal set of entries required by
    the OOXML specification.

    Returns:
        str: Absolute path to the created file.
    """
    file_path = tmp_path / "test.docx"

    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" '
        'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="xml" ContentType="application/xml"/>\n'
        '  <Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument'
        '.wordprocessingml.document.main+xml"/>\n'
        "</Types>"
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>\n'
        "</Relationships>"
    )

    doc_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        "</Relationships>"
    )

    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n'
        "  <w:body>\n"
        "    <w:p>\n"
        "      <w:r>\n"
        "        <w:t>机器学习测试文档</w:t>\n"
        "      </w:r>\n"
        "    </w:p>\n"
        "    <w:p>\n"
        "      <w:r>\n"
        "        <w:t>深度学习是人工智能的重要方向。</w:t>\n"
        "      </w:r>\n"
        "    </w:p>\n"
        "  </w:body>\n"
        "</w:document>"
    )

    with zipfile.ZipFile(file_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("word/_rels/document.xml.rels", doc_rels_xml)
        zf.writestr("word/document.xml", document_xml)

    return str(file_path)


@pytest.fixture
def sample_large_file(tmp_path: Path) -> str:
    """Create a file just over MAX_UPLOAD_SIZE_MB for 413 testing.

    Uses ``os.truncate`` / ``file.truncate`` to allocate the size
    instantly without writing every byte to disk.

    Returns:
        str: Absolute path to the created file.
    """
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    file_path = tmp_path / "large.bin"
    with open(file_path, "wb") as f:
        f.truncate(max_bytes + 1024)  # 1 KB over the limit
    return str(file_path)


@pytest.fixture
def sample_unsupported_file(tmp_path: Path) -> str:
    """Create a .exe file for unsupported-extension testing.

    Returns:
        str: Absolute path to the created file.
    """
    file_path = tmp_path / "malware.exe"
    file_path.write_bytes(b"MZ\x90\x00")  # DOS MZ header stub
    return str(file_path)


# ── API-integration fixtures ────────────────────────────────────────────


@pytest_asyncio.fixture
async def uploaded_document(
    async_client,
    student_token: str,
    sample_txt_file: str,
) -> dict:
    """Upload a sample document through the API.

    POSTs a .txt file to ``/api/v1/documents`` as a student user and
    returns the full response JSON.

    Args:
        async_client: httpx.AsyncClient wired to the FastAPI ASGI app.
        student_token: JWT access_token fixture for a student user.
        sample_txt_file: Path to a pre-created .txt file.

    Returns:
        dict: Full API response ``{"code": 0, "message": "...", "data": {...}}``.
    """
    filename = os.path.basename(sample_txt_file)
    with open(sample_txt_file, "rb") as f:
        response = await async_client.post(
            "/api/v1/documents",
            files={"file": (filename, f, "text/plain")},
            data={
                "title": "机器学习入门",
                "file_type": "reference",
                "description": "测试用机器学习文档",
                "tags": '["测试", "机器学习"]',
            },
            headers={"Authorization": f"Bearer {student_token}"},
        )
    assert response.status_code == 201, (
        f"Upload failed: {response.status_code} — {response.text}"
    )
    return response.json()


@pytest_asyncio.fixture
async def approved_document(
    async_client,
    admin_token: str,
    uploaded_document: dict,
) -> dict:
    """Approve a previously uploaded document as admin.

    Calls ``POST /api/v1/documents/{id}/approve`` with ``status=approved``.

    Args:
        async_client: httpx.AsyncClient.
        admin_token: JWT access_token for an admin user.
        uploaded_document: Response from the ``uploaded_document`` fixture.

    Returns:
        dict: Document data from the approval response (``data`` field).
    """
    doc_id = uploaded_document["data"]["id"]
    response = await async_client.post(
        f"/api/v1/documents/{doc_id}/approve",
        json={"status": "approved", "comment": "审核通过"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200, (
        f"Approve failed: {response.status_code} — {response.text}"
    )
    return response.json()["data"]


@pytest_asyncio.fixture
async def processed_document(
    async_client,
    admin_token: str,
    uploaded_document: dict,
) -> dict:
    """Process and approve an uploaded document (full pipeline).

    1. ``POST /api/v1/documents/{id}/process`` — triggers parsing/chunking
    2. ``POST /api/v1/documents/{id}/approve`` — marks it approved

    Note: Processing is async in production but synchronous in test
    mode, so the response reflects completed processing.

    Args:
        async_client: httpx.AsyncClient.
        admin_token: JWT access_token for an admin user.
        uploaded_document: Response from the ``uploaded_document`` fixture.

    Returns:
        dict: Document data after processing + approval (``data`` field).
    """
    doc_id = uploaded_document["data"]["id"]

    # Step 1: Process (parse + chunk + vectorise)
    proc_resp = await async_client.post(
        f"/api/v1/documents/{doc_id}/process",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert proc_resp.status_code == 200, (
        f"Process failed: {proc_resp.status_code} — {proc_resp.text}"
    )

    # Step 2: Approve
    appr_resp = await async_client.post(
        f"/api/v1/documents/{doc_id}/approve",
        json={"status": "approved", "comment": "审核通过"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert appr_resp.status_code == 200, (
        f"Approve failed: {appr_resp.status_code} — {appr_resp.text}"
    )

    return appr_resp.json()["data"]
