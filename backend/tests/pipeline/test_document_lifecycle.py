"""Document lifecycle tests — upload → process → approve → search → delete → cleanup.

Covers the complete document lifecycle from creation through approval
to searchability and eventual deletion with ChromaDB vector cleanup.
Also validates that only approved documents appear in search results
and that state transitions are properly authorized.

Test classes:
    TestDocumentLifecycle          — full upload-to-searchable pipeline
    TestRejectedDocumentExclusion  — rejected docs excluded from search
    TestDocumentDeletion           — delete + ChromaDB cleanup
    TestStateTransitions           — authorization & status validation
"""

import os
import uuid

import pytest
import pytest_asyncio

from app.core.config import settings
from app.services.vector_store import vector_store
from tests.utils import assert_api_response


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════


async def _upload_document(async_client, token: str, file_path: str, **overrides) -> dict:
    """Upload a document through the API and return the full response JSON body.

    Args:
        async_client: httpx.AsyncClient wired to the FastAPI ASGI app.
        token: JWT access_token for the uploading user.
        file_path: Absolute path to the file to upload.
        **overrides: Override form fields (title, file_type, description, tags, course_id).

    Returns:
        dict: Full API response ``{"code": ..., "message": ..., "data": {...}}``.
    """
    filename = os.path.basename(file_path)
    form_data = {
        "title": overrides.pop("title", "测试文档"),
        "file_type": overrides.pop("file_type", "reference"),
        "description": overrides.pop("description", "生命周期测试"),
        "tags": overrides.pop("tags", '["测试"]'),
    }
    form_data.update(overrides)

    with open(file_path, "rb") as f:
        response = await async_client.post(
            "/api/v1/documents",
            files={"file": (filename, f, "text/plain")},
            data=form_data,
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 201, (
        f"Upload failed: {response.status_code} — {response.text[:200]}"
    )
    return response.json()


async def _process_document(async_client, token: str, doc_id: int) -> dict:
    """Trigger document processing (parse → chunk → vectorise).

    Returns the full API response JSON.
    """
    response = await async_client.post(
        f"/api/v1/documents/{doc_id}/process",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, (
        f"Process failed: {response.status_code} — {response.text[:200]}"
    )
    return response.json()


async def _approve_document(
    async_client, token: str, doc_id: int, status: str = "approved"
) -> dict:
    """Approve or reject a document as admin.

    Returns the full API response JSON.
    """
    comment = "审核通过" if status == "approved" else "审核拒绝"
    response = await async_client.post(
        f"/api/v1/documents/{doc_id}/approve",
        json={"status": status, "comment": comment},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, (
        f"Approve failed ({status}): {response.status_code} — {response.text[:200]}"
    )
    return response.json()


async def _search(async_client, token: str, query: str, mode: str = "keyword") -> dict:
    """Execute a search and return the parsed data field."""
    response = await async_client.get(
        "/api/v1/search",
        params={"q": query, "mode": mode, "page_size": 20},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, (
        f"Search failed: {response.status_code} — {response.text[:200]}"
    )
    body = response.json()
    assert body.get("code") == 0, f"Search error: {body.get('message', '')}"
    return body.get("data", {})


async def _get_doc_ids_from_search(search_data: dict) -> set[int]:
    """Extract unique document_ids from search results."""
    return {r["document_id"] for r in search_data.get("results", [])}


async def _ensure_user(create_test_user, role: str = "student") -> tuple:
    """Create or return a user with the given role, returning (User, token)."""
    return await create_test_user(
        role=role,
        username=f"{role}_{uuid.uuid4().hex[:8]}",
    )


# ═══════════════════════════════════════════════════════════════════════
# TestDocumentLifecycle — full upload → searchable pipeline
# ═══════════════════════════════════════════════════════════════════════


class TestDocumentLifecycle:
    """Complete document lifecycle: upload → process → approve → searchable."""

    @pytest.mark.asyncio
    async def test_full_lifecycle_upload_to_searchable(
        self, async_client, create_test_user, tmp_path
    ):
        """Upload → process → approve → keyword search finds the document."""
        # Use unique UUID in content to isolate from other committed test data
        uid = uuid.uuid4().hex[:12]
        content = f"机器学习是人工智能的重要分支。{uid} 深度学习是机器学习的子领域。"
        file_path = tmp_path / f"test_{uid}.txt"
        file_path.write_text(content, encoding="utf-8")

        # Create users with unique usernames per test
        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        # 1. Student uploads
        upload_body = await _upload_document(
            async_client, student_token, str(file_path),
            title="机器学习生命周期测试",
        )
        doc_id = upload_body["data"]["id"]
        assert upload_body["code"] == 0
        assert upload_body["data"]["status"] == "pending"

        # 2. Admin processes (parse + chunk + vectorise)
        proc_body = await _process_document(async_client, admin_token, doc_id)
        assert proc_body["code"] == 0
        assert "处理完成" in proc_body.get("message", ""), (
            f"Process message: {proc_body.get('message', '')}"
        )

        # 3. Admin approves
        await _approve_document(async_client, admin_token, doc_id, status="approved")

        # Verify status after approval
        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert detail_resp.status_code == 200
        detail = detail_resp.json()["data"]
        assert detail["status"] == "approved"
        assert detail["processing_status"] == "completed"
        # chunks were created (verified by search below)

        # 4. Verify searchable — keyword search for unique UUID
        search_data = await _search(async_client, student_token, uid, mode="keyword")
        doc_ids = await _get_doc_ids_from_search(search_data)
        assert doc_id in doc_ids, (
            f"Document {doc_id} not found in search results. "
            f"Found doc_ids: {doc_ids}"
        )
        assert search_data["mode"] == "keyword"
        assert search_data["total"] >= 1

    @pytest.mark.asyncio
    async def test_approved_document_detail_accessible(
        self, async_client, create_test_user, sample_txt_file
    ):
        """After approval, document detail is accessible and has chunks."""
        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        upload_body = await _upload_document(
            async_client, student_token, sample_txt_file,
            title="可访问文档详情测试",
        )
        doc_id = upload_body["data"]["id"]

        await _process_document(async_client, admin_token, doc_id)
        await _approve_document(async_client, admin_token, doc_id)

        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert detail_resp.status_code == 200
        detail = detail_resp.json()["data"]
        assert detail["status"] == "approved"
        assert detail["id"] == doc_id
        assert detail["title"] == "可访问文档详情测试"


# ═══════════════════════════════════════════════════════════════════════
# TestRejectedDocumentExclusion
# ═══════════════════════════════════════════════════════════════════════


class TestRejectedDocumentExclusion:
    """Rejected documents must not appear in search results."""

    @pytest.mark.asyncio
    async def test_rejected_document_not_in_keyword_search(
        self, async_client, create_test_user, tmp_path
    ):
        """Upload doc A (approve) and doc B (reject); only doc A in search."""
        # Use unique content per test to isolate search results across tests.
        # handlers call db.commit() internally, so test_db rollback can't undo.
        uid = uuid.uuid4().hex[:12]
        content = f"机器学习是人工智能的重要分支。{uid} 深度学习是机器学习的子领域。"
        file_path = tmp_path / f"test_{uid}.txt"
        file_path.write_text(content, encoding="utf-8")
        unique_file = str(file_path)

        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        # Doc A: approve
        upload_a = await _upload_document(
            async_client, student_token, unique_file,
            title="被批准的文档A",
        )
        doc_a_id = upload_a["data"]["id"]
        await _process_document(async_client, admin_token, doc_a_id)
        await _approve_document(async_client, admin_token, doc_a_id, status="approved")

        # Doc B: reject
        upload_b = await _upload_document(
            async_client, student_token, unique_file,
            title="被拒绝的文档B",
        )
        doc_b_id = upload_b["data"]["id"]
        await _process_document(async_client, admin_token, doc_b_id)
        await _approve_document(async_client, admin_token, doc_b_id, status="rejected")

        # Verify doc B status
        detail_b = await async_client.get(
            f"/api/v1/documents/{doc_b_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert detail_b.json()["data"]["status"] == "rejected"

        # Search for the unique UUID — only doc A (approved) should appear
        search_data = await _search(async_client, student_token, uid, mode="keyword")
        doc_ids = await _get_doc_ids_from_search(search_data)

        assert doc_a_id in doc_ids, (
            f"Approved document {doc_a_id} missing from search. Found: {doc_ids}"
        )
        assert doc_b_id not in doc_ids, (
            f"Rejected document {doc_b_id} incorrectly appears in search"
        )

    @pytest.mark.asyncio
    async def test_pending_document_not_in_search(
        self, async_client, create_test_user, sample_txt_file
    ):
        """A document that has been processed but NOT yet approved should not appear."""
        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        upload_body = await _upload_document(
            async_client, student_token, sample_txt_file,
            title="待审核文档",
        )
        doc_id = upload_body["data"]["id"]

        # Process but do NOT approve
        await _process_document(async_client, admin_token, doc_id)

        # Verify it's still pending
        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert detail_resp.json()["data"]["status"] == "pending"

        # Search should NOT return this document
        search_data = await _search(async_client, student_token, "机器", mode="keyword")
        doc_ids = await _get_doc_ids_from_search(search_data)
        assert doc_id not in doc_ids, (
            f"Pending document {doc_id} incorrectly appears in search"
        )


# ═══════════════════════════════════════════════════════════════════════
# TestDocumentDeletion
# ═══════════════════════════════════════════════════════════════════════


class TestDocumentDeletion:
    """Delete removes DB records, disk files, and ChromaDB vectors."""

    @pytest.mark.asyncio
    async def test_delete_removes_from_search(
        self, async_client, create_test_user, tmp_path
    ):
        """After deletion, document is no longer accessible or searchable."""
        # Use unique content per test to isolate search results across tests.
        uid = uuid.uuid4().hex[:12]
        content = f"机器学习是人工智能的重要分支。{uid} 深度学习是机器学习的子领域。"
        file_path = tmp_path / f"test_{uid}.txt"
        file_path.write_text(content, encoding="utf-8")
        unique_file = str(file_path)

        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        # Upload → process → approve → searchable
        upload_body = await _upload_document(
            async_client, student_token, unique_file,
            title="待删除文档",
        )
        doc_id = upload_body["data"]["id"]
        await _process_document(async_client, admin_token, doc_id)
        await _approve_document(async_client, admin_token, doc_id)

        # Confirm searchable by searching for the unique UUID
        search_before = await _search(async_client, student_token, uid, mode="keyword")
        doc_ids_before = await _get_doc_ids_from_search(search_before)
        assert doc_id in doc_ids_before, "Document should be searchable before deletion"

        # Delete as uploader (student who uploaded)
        del_resp = await async_client.delete(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert del_resp.status_code == 200, (
            f"Delete failed: {del_resp.status_code} — {del_resp.text[:200]}"
        )

        # Verify 404 on detail fetch
        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert detail_resp.status_code == 404, (
            f"Deleted document should return 404, got {detail_resp.status_code}"
        )

        # Verify not in search (search by unique UUID again)
        search_after = await _search(async_client, student_token, uid, mode="keyword")
        doc_ids_after = await _get_doc_ids_from_search(search_after)
        assert doc_id not in doc_ids_after, (
            f"Deleted document {doc_id} should not appear in search"
        )

    @pytest.mark.asyncio
    async def test_delete_cleans_up_chroma_vectors(
        self, async_client, create_test_user, tmp_path
    ):
        """After deletion, ChromaDB contains no vectors for the document."""
        # Use unique content per test to isolate from other committed test data.
        uid = uuid.uuid4().hex[:12]
        content = f"机器学习是人工智能的重要分支。{uid} 深度学习是机器学习的子领域。"
        file_path = tmp_path / f"test_{uid}.txt"
        file_path.write_text(content, encoding="utf-8")
        unique_file = str(file_path)

        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        # Upload → process → approve (vectors created during processing)
        upload_body = await _upload_document(
            async_client, student_token, unique_file,
            title="ChromaDB清理测试文档",
        )
        doc_id = upload_body["data"]["id"]
        await _process_document(async_client, admin_token, doc_id)
        await _approve_document(async_client, admin_token, doc_id)

        # Verify vectors exist in ChromaDB before deletion
        # Use int(doc_id) to ensure type matches ChromaDB's SQLite INTEGER storage
        existing_before = vector_store._collection.get(
            where={"document_id": int(doc_id)}
        )
        ids_before = existing_before.get("ids", []) if existing_before else []
        if not ids_before:
            # Debug: check all metadata in collection to diagnose
            all_data = vector_store._collection.get(limit=100, include=["metadatas"])
            stored_doc_ids = {
                m.get("document_id")
                for m in (all_data.get("metadatas") or [])
                if m and "document_id" in m
            }
            raise AssertionError(
                f"ChromaDB has no vectors for doc {doc_id} before deletion. "
                f"Stored document_ids (first 100): {sorted(stored_doc_ids)}"
            )
        assert len(ids_before) > 0, (
            f"Expected chunks in ChromaDB for doc {doc_id} before deletion"
        )

        # Delete document
        del_resp = await async_client.delete(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert del_resp.status_code == 200

        # Verify ChromaDB vectors are removed
        existing_after = vector_store._collection.get(
            where={"document_id": int(doc_id)}
        )
        ids_after = existing_after.get("ids", []) if existing_after else []
        assert len(ids_after) == 0, (
            f"ChromaDB vectors not cleaned up for doc {doc_id}: "
            f"found {len(ids_after)} remaining chunks"
        )

    @pytest.mark.asyncio
    async def test_delete_nonexistent_document_returns_404(
        self, async_client, create_test_user
    ):
        """Deleting a non-existent document returns 404."""
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        response = await async_client.delete(
            "/api/v1/documents/99999",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_non_owner_student_cannot_delete(
        self, async_client, create_test_user, sample_txt_file
    ):
        """A student who is not the uploader cannot delete another's document."""
        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        # Student uploads
        upload_body = await _upload_document(
            async_client, student_token, sample_txt_file,
            title="所有权测试文档",
        )
        doc_id = upload_body["data"]["id"]

        # Create another student user
        other_user, other_token = await _ensure_user(create_test_user, "student")

        # Other student tries to delete → 403
        del_resp = await async_client.delete(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert del_resp.status_code == 403, (
            f"Expected 403, got {del_resp.status_code}: {del_resp.text[:200]}"
        )

        # Admin CAN delete
        admin_del = await async_client.delete(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert admin_del.status_code == 200


# ═══════════════════════════════════════════════════════════════════════
# TestStateTransitions
# ═══════════════════════════════════════════════════════════════════════


class TestStateTransitions:
    """Document status transition validation and authorization."""

    @pytest.mark.asyncio
    async def test_admin_can_approve_pending_document(
        self, async_client, create_test_user, sample_txt_file
    ):
        """Pending → approved transition works for admin."""
        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        upload_body = await _upload_document(
            async_client, student_token, sample_txt_file,
            title="待批准状态测试",
        )
        doc_id = upload_body["data"]["id"]
        assert upload_body["data"]["status"] == "pending"

        await _approve_document(async_client, admin_token, doc_id, status="approved")

        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert detail_resp.json()["data"]["status"] == "approved"
        assert detail_resp.json()["data"]["audit_comment"] == "审核通过"

    @pytest.mark.asyncio
    async def test_admin_can_reject_pending_document(
        self, async_client, create_test_user, sample_txt_file
    ):
        """Pending → rejected transition works for admin."""
        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        upload_body = await _upload_document(
            async_client, student_token, sample_txt_file,
            title="待拒绝状态测试",
        )
        doc_id = upload_body["data"]["id"]

        await _approve_document(async_client, admin_token, doc_id, status="rejected")

        detail_resp = await async_client.get(
            f"/api/v1/documents/{doc_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert detail_resp.json()["data"]["status"] == "rejected"
        assert detail_resp.json()["data"]["audit_comment"] == "审核拒绝"

    @pytest.mark.asyncio
    async def test_non_admin_cannot_approve(
        self, async_client, create_test_user, sample_txt_file
    ):
        """Student cannot approve documents."""
        student_user, student_token = await _ensure_user(create_test_user, "student")

        upload_body = await _upload_document(
            async_client, student_token, sample_txt_file,
            title="越权审核测试",
        )
        doc_id = upload_body["data"]["id"]

        response = await async_client.post(
            f"/api/v1/documents/{doc_id}/approve",
            json={"status": "approved", "comment": "学生不应该能审核"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        # require_role("admin") should return 403
        assert response.status_code == 403, (
            f"Expected 403, got {response.status_code}: {response.text[:200]}"
        )

    @pytest.mark.asyncio
    async def test_approve_nonexistent_document_returns_404(
        self, async_client, create_test_user
    ):
        """Approving a non-existent document returns 404."""
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        response = await async_client.post(
            "/api/v1/documents/99999/approve",
            json={"status": "approved", "comment": "不存在"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_status_rejected_by_schema(
        self, async_client, create_test_user, sample_txt_file
    ):
        """Invalid status value (not 'approved' or 'rejected') returns 422."""
        student_user, student_token = await _ensure_user(create_test_user, "student")
        admin_user, admin_token = await _ensure_user(create_test_user, "admin")

        upload_body = await _upload_document(
            async_client, student_token, sample_txt_file,
            title="无效状态测试",
        )
        doc_id = upload_body["data"]["id"]

        response = await async_client.post(
            f"/api/v1/documents/{doc_id}/approve",
            json={"status": "pending", "comment": "这个状态不应该通过"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Pydantic pattern validation rejects "pending" — it must be approved|rejected
        assert response.status_code == 422, (
            f"Expected 422 for invalid status, got {response.status_code}: {response.text[:200]}"
        )

    @pytest.mark.asyncio
    async def test_teacher_cannot_approve_unless_admin(
        self, async_client, create_test_user, sample_txt_file
    ):
        """Teacher role cannot approve documents — only admin can."""
        teacher_user, teacher_token = await _ensure_user(create_test_user, "teacher")

        # Teacher uploads a doc
        upload_body = await _upload_document(
            async_client, teacher_token, sample_txt_file,
            title="教师上传的文档",
        )
        doc_id = upload_body["data"]["id"]

        # Teacher tries to approve → 403 (require_role("admin"))
        response = await async_client.post(
            f"/api/v1/documents/{doc_id}/approve",
            json={"status": "approved", "comment": "教师不能审核"},
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        assert response.status_code == 403, (
            f"Teacher should not be able to approve (expected 403), "
            f"got {response.status_code}: {response.text[:200]}"
        )
