"""API integration tests for document endpoints.

POST   /api/v1/documents       — upload (multipart/form-data)
GET    /api/v1/documents       — list (paginated, filterable)
GET    /api/v1/documents/{id}  — detail
PUT    /api/v1/documents/{id}  — update metadata
DELETE /api/v1/documents/{id}  — delete (file + DB + vectors)

All tests use the ``async_client`` fixture (httpx.AsyncClient against
the real FastAPI ASGI app) with a transactional PostgreSQL test database.
Auth fixtures (``student_token``, ``teacher_token``, ``admin_token``)
create real User records before each test.

Success responses follow APIResponse format: {code: 0, message, data}.
Error responses from HTTPException follow FastAPI default: {detail: "..."}.
"""

import os
from pathlib import Path

import pytest

from app.core.config import settings
from tests.utils import assert_api_response

# ─────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────

_UPLOAD_URL = "/api/v1/documents"
_LIST_URL = "/api/v1/documents"


def _auth(token: str) -> dict:
    """Build Authorization header dict from a JWT token."""
    return {"Authorization": f"Bearer {token}"}


async def _upload(
    async_client,
    token: str,
    file_path: str,
    *,
    title: str = "测试文档",
    file_type: str = "reference",
    description: str = "",
    tags: str = '["test"]',
    course_id: int | None = None,
    expected_status: int = 201,
):
    """Helper: upload a file and return the parsed response data dict."""
    data_fields = {
        "title": title,
        "file_type": file_type,
        "description": description,
        "tags": tags,
    }
    if course_id is not None:
        data_fields["course_id"] = str(course_id)

    filename = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        response = await async_client.post(
            _UPLOAD_URL,
            files={"file": (filename, f, "application/octet-stream")},
            data=data_fields,
            headers=_auth(token),
        )
    # For success, use assert_api_response; for errors, let caller check
    if expected_status in (200, 201):
        data = assert_api_response(response, expected_status, expected_code=0)
        return data
    return response.json()


# ═════════════════════════════════════════════════════════════════════════
# POST /api/v1/documents — Upload
# ═════════════════════════════════════════════════════════════════════════


class TestDocumentUpload:
    """Tests for POST /api/v1/documents (multipart/form-data upload)."""

    # ── success cases ──────────────────────────────────────────────────

    async def test_upload_txt_success(
        self, async_client, student_token, sample_txt_file
    ):
        """Upload a .txt file → 201 with correct DocumentItem fields."""
        filename = os.path.basename(sample_txt_file)
        with open(sample_txt_file, "rb") as f:
            response = await async_client.post(
                _UPLOAD_URL,
                files={"file": (filename, f, "text/plain")},
                data={
                    "title": "机器学习入门",
                    "file_type": "reference",
                    "description": "测试用机器学习文档",
                    "tags": '["测试", "机器学习"]',
                },
                headers=_auth(student_token),
            )
        data = assert_api_response(response, 201, expected_code=0)

        assert data["title"] == "机器学习入门"
        assert data["file_type"] == "reference"
        assert data["status"] == "pending"
        assert data["processing_status"] == "pending"
        assert data["chunk_count"] == 0
        assert data["filename"] == filename
        assert data["file_size"] > 0
        assert isinstance(data["tags"], list)
        assert "测试" in data["tags"]
        assert "机器学习" in data["tags"]
        assert data["file_hash"] is not None
        # uploader info should be present
        assert data["uploader"] is not None
        assert "id" in data["uploader"]
        assert "real_name" in data["uploader"]

    async def test_upload_pdf_success(
        self, async_client, student_token, sample_pdf_file
    ):
        """Upload a .pdf file → 201."""
        data = await _upload(
            async_client,
            student_token,
            sample_pdf_file,
            title="PDF测试",
            file_type="courseware",
        )
        assert data["file_type"] == "courseware"
        assert data["filename"].endswith(".pdf")
        assert data["status"] == "pending"

    async def test_upload_docx_success(
        self, async_client, student_token, sample_docx_file
    ):
        """Upload a .docx file → 201."""
        data = await _upload(
            async_client,
            student_token,
            sample_docx_file,
            title="DOCX测试",
            file_type="assignment",
        )
        assert data["file_type"] == "assignment"
        assert data["filename"].endswith(".docx")
        assert data["status"] == "pending"

    # ── validation errors ──────────────────────────────────────────────

    async def test_upload_unsupported_file_type(
        self, async_client, student_token, sample_unsupported_file
    ):
        """Upload a .exe file → 400."""
        filename = os.path.basename(sample_unsupported_file)
        with open(sample_unsupported_file, "rb") as f:
            response = await async_client.post(
                _UPLOAD_URL,
                files={"file": (filename, f, "application/octet-stream")},
                data={"title": "恶意文件", "file_type": "other"},
                headers=_auth(student_token),
            )
        assert response.status_code == 400
        body = response.json()
        assert "不支持" in body.get("detail", "")

    async def test_upload_oversized_file(
        self, async_client, student_token, sample_large_file
    ):
        """Upload a file > MAX_UPLOAD_SIZE_MB → 413."""
        filename = os.path.basename(sample_large_file)
        with open(sample_large_file, "rb") as f:
            response = await async_client.post(
                _UPLOAD_URL,
                files={"file": (filename, f, "application/octet-stream")},
                data={"title": "超大文件", "file_type": "reference"},
                headers=_auth(student_token),
            )
        assert response.status_code in (400, 413), f"Expected 400 or 413, got {response.status_code}"
        body = response.json()
        if response.status_code == 413:
            assert "文件大小" in body.get("detail", "")

    async def test_upload_empty_file(
        self, async_client, student_token, tmp_path: Path
    ):
        """Upload a 0-byte .txt file → 201 (no explicit empty-file rejection).

        NOTE: The current implementation does not reject 0-byte files.
        If empty-file validation is added, this test should be updated.
        """
        file_path = tmp_path / "empty.txt"
        file_path.write_text("", encoding="utf-8")

        with open(file_path, "rb") as f:
            response = await async_client.post(
                _UPLOAD_URL,
                files={"file": ("empty.txt", f, "text/plain")},
                data={"title": "空文件", "file_type": "reference"},
                headers=_auth(student_token),
            )
        data = assert_api_response(response, 201, expected_code=0)
        assert data["file_size"] == 0
        assert data["status"] == "pending"

    # ── auth errors ────────────────────────────────────────────────────

    async def test_upload_missing_auth(self, async_client, sample_txt_file):
        """Upload without Authorization header → 401."""
        filename = os.path.basename(sample_txt_file)
        with open(sample_txt_file, "rb") as f:
            response = await async_client.post(
                _UPLOAD_URL,
                files={"file": (filename, f, "text/plain")},
                data={"title": "未授权上传", "file_type": "reference"},
            )
        assert response.status_code == 401

    async def test_upload_with_expired_token(
        self, async_client, expired_token, sample_txt_file
    ):
        """Upload with an expired JWT token → 401."""
        filename = os.path.basename(sample_txt_file)
        with open(sample_txt_file, "rb") as f:
            response = await async_client.post(
                _UPLOAD_URL,
                files={"file": (filename, f, "text/plain")},
                data={"title": "过期Token", "file_type": "reference"},
                headers=_auth(expired_token),
            )
        assert response.status_code == 401


# ═════════════════════════════════════════════════════════════════════════
# GET /api/v1/documents — List
# ═════════════════════════════════════════════════════════════════════════


class TestDocumentList:
    """Tests for GET /api/v1/documents (paginated list with filters)."""

    async def test_list_documents(
        self, async_client, student_token, sample_txt_file
    ):
        """Upload 2 docs, list all → verify count and structure."""
        await _upload(async_client, student_token, sample_txt_file, title="文档A")
        await _upload(async_client, student_token, sample_txt_file, title="文档B")

        response = await async_client.get(
            _LIST_URL, headers=_auth(student_token)
        )
        data = assert_api_response(response, 200, expected_code=0)

        assert isinstance(data, dict)
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        assert data["total"] >= 2
        assert isinstance(data["items"], list)

        # Each item should have key DocumentItem fields
        for item in data["items"]:
            assert "id" in item
            assert "title" in item
            assert "file_type" in item
            assert "status" in item
            assert "processing_status" in item

    async def test_list_pagination(
        self, async_client, student_token, sample_txt_file
    ):
        """Upload 3 docs, request page_size=2 → 2 items, total=3."""
        for i in range(3):
            await _upload(
                async_client, student_token, sample_txt_file,
                title=f"分页文档{i}",
            )

        response = await async_client.get(
            _LIST_URL,
            params={"page_size": 2, "page": 1},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200, expected_code=0)

        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total"] >= 3
        assert data["total_pages"] >= 2

    async def test_list_filter_by_file_type(
        self, async_client, student_token,
        sample_txt_file, sample_pdf_file,
    ):
        """Upload 2 docs with different file_type, filter → only matching."""
        await _upload(
            async_client, student_token, sample_txt_file,
            title="参考文档", file_type="reference",
        )
        await _upload(
            async_client, student_token, sample_pdf_file,
            title="课件文档", file_type="courseware",
        )

        # Filter by reference
        response = await async_client.get(
            _LIST_URL,
            params={"file_type": "reference"},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        for item in data["items"]:
            assert item["file_type"] == "reference"

        # Filter by courseware
        response = await async_client.get(
            _LIST_URL,
            params={"file_type": "courseware"},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        for item in data["items"]:
            assert item["file_type"] == "courseware"

    async def test_list_filter_by_status(
        self, async_client, student_token, sample_txt_file
    ):
        """Filter by status='pending' → only pending docs returned."""
        # Upload 2 docs (both start as pending)
        await _upload(async_client, student_token, sample_txt_file, title="待处理1")
        await _upload(async_client, student_token, sample_txt_file, title="待处理2")

        response = await async_client.get(
            _LIST_URL,
            params={"status": "pending"},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        assert len(data["items"]) >= 2
        for item in data["items"]:
            assert item["status"] == "pending"

        # Filter by approved → should be empty
        response = await async_client.get(
            _LIST_URL,
            params={"status": "approved"},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        for item in data["items"]:
            assert item["status"] == "approved"


# ═════════════════════════════════════════════════════════════════════════
# GET /api/v1/documents/{id} — Detail
# ═════════════════════════════════════════════════════════════════════════


class TestDocumentDetail:
    """Tests for GET /api/v1/documents/{id} (document detail)."""

    async def test_get_document_detail(
        self, async_client, student_token, sample_txt_file
    ):
        """Get document detail → all DocumentDetail fields present."""
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="详细文档", description="这是一份详细的测试文档",
        )
        doc_id = uploaded["id"]

        response = await async_client.get(
            f"/api/v1/documents/{doc_id}", headers=_auth(student_token)
        )
        data = assert_api_response(response, 200, expected_code=0)

        # Verify all key DocumentDetail fields
        assert data["id"] == doc_id
        assert data["title"] == "详细文档"
        assert data["file_type"] == "reference"
        assert data["description"] == "这是一份详细的测试文档"
        assert data["status"] == "pending"
        assert data["processing_status"] == "pending"
        assert data["chunk_count"] == 0
        assert data["file_hash"] is not None
        assert data["file_size"] > 0
        assert isinstance(data["tags"], list)
        assert data["uploader"] is not None
        assert "chunks_preview" in data
        assert isinstance(data["chunks_preview"], list)

    async def test_get_nonexistent_document(
        self, async_client, student_token
    ):
        """Get a non-existent document ID → 404."""
        response = await async_client.get(
            "/api/v1/documents/999999", headers=_auth(student_token)
        )
        assert response.status_code == 404


# ═════════════════════════════════════════════════════════════════════════
# PUT /api/v1/documents/{id} — Update
# ═════════════════════════════════════════════════════════════════════════


class TestDocumentUpdate:
    """Tests for PUT /api/v1/documents/{id} (update document metadata)."""

    async def test_update_document_title(
        self, async_client, student_token, sample_txt_file
    ):
        """Update document title → 200, title changed."""
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="原始标题",
        )
        doc_id = uploaded["id"]

        response = await async_client.put(
            f"/api/v1/documents/{doc_id}",
            json={"title": "修改后的标题"},
            headers=_auth(student_token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        assert data["title"] == "修改后的标题"
        assert data["id"] == doc_id

        # Verify the change persists (re-fetch)
        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}", headers=_auth(student_token)
        )
        detail = assert_api_response(detail_resp, 200, expected_code=0)
        assert detail["title"] == "修改后的标题"

    async def test_update_other_users_document_forbidden(
        self, async_client, student_token, create_test_user, sample_txt_file
    ):
        """Student B tries to update Student A's document → 403."""
        # Student A uploads
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="学生A的文档",
        )
        doc_id = uploaded["id"]

        # Student B attempts update
        _, student_b_token = await create_test_user(role="student")
        response = await async_client.put(
            f"/api/v1/documents/{doc_id}",
            json={"title": "学生B篡改标题"},
            headers=_auth(student_b_token),
        )
        assert response.status_code == 403


# ═════════════════════════════════════════════════════════════════════════
# DELETE /api/v1/documents/{id} — Delete
# ═════════════════════════════════════════════════════════════════════════


class TestDocumentDelete:
    """Tests for DELETE /api/v1/documents/{id} (delete document)."""

    async def test_delete_document(
        self, async_client, student_token, sample_txt_file
    ):
        """Delete a document → removed from list."""
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="待删除文档",
        )
        doc_id = uploaded["id"]

        # Delete
        response = await async_client.delete(
            f"/api/v1/documents/{doc_id}", headers=_auth(student_token)
        )
        assert_api_response(response, 200, expected_code=0)

        # Verify deleted — GET returns 404
        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}", headers=_auth(student_token)
        )
        assert detail_resp.status_code == 404

    async def test_delete_other_users_document_forbidden(
        self, async_client, student_token, create_test_user, sample_txt_file
    ):
        """Student B tries to delete Student A's document → 403."""
        # Student A uploads
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="学生A的文档",
        )
        doc_id = uploaded["id"]

        # Student B attempts delete
        _, student_b_token = await create_test_user(role="student")
        response = await async_client.delete(
            f"/api/v1/documents/{doc_id}", headers=_auth(student_b_token)
        )
        assert response.status_code == 403


# ═════════════════════════════════════════════════════════════════════════
# Permission isolation
# ═════════════════════════════════════════════════════════════════════════


class TestDocumentPermissions:
    """Cross-user permission isolation tests.

    - Student A uploads a document
    - Student B should NOT be able to update or delete it (403)
    - Admin CAN update or delete anyone's document
    """

    async def test_admin_can_update_any_document(
        self, async_client, student_token, admin_token, sample_txt_file
    ):
        """Admin updates a student's document → 200."""
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="学生上传的文档",
        )
        doc_id = uploaded["id"]

        response = await async_client.put(
            f"/api/v1/documents/{doc_id}",
            json={"title": "管理员修改"},
            headers=_auth(admin_token),
        )
        data = assert_api_response(response, 200, expected_code=0)
        assert data["title"] == "管理员修改"

    async def test_admin_can_delete_any_document(
        self, async_client, student_token, admin_token, sample_txt_file
    ):
        """Admin deletes a student's document → 200, then 404."""
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="学生上传的文档",
        )
        doc_id = uploaded["id"]

        response = await async_client.delete(
            f"/api/v1/documents/{doc_id}", headers=_auth(admin_token)
        )
        assert_api_response(response, 200, expected_code=0)

        # Verify gone
        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}", headers=_auth(admin_token)
        )
        assert detail_resp.status_code == 404

    async def test_teacher_cannot_update_student_document(
        self, async_client, student_token, teacher_token, sample_txt_file
    ):
        """Teacher (non-admin) cannot update a student's document → 403."""
        uploaded = await _upload(
            async_client, student_token, sample_txt_file,
            title="学生文档",
        )
        doc_id = uploaded["id"]

        response = await async_client.put(
            f"/api/v1/documents/{doc_id}",
            json={"title": "教师篡改"},
            headers=_auth(teacher_token),
        )
        assert response.status_code == 403
