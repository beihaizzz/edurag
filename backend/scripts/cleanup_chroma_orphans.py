"""清理 ChromaDB 中的孤儿向量：删除 document_id 不在 PostgreSQL documents 表中的全部向量。

数据库清理（cleanup_db_full.py）只清了 PostgreSQL，ChromaDB 向量库残留了
大量已删除文档的向量，导致 QA 检索到不相关的幽灵来源（如 Document7）。
本脚本使 ChromaDB 与 PostgreSQL documents 表保持一致。

用法:
    cd backend
    python scripts/cleanup_chroma_orphans.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine


async def _valid_document_ids() -> set[int]:
    async with engine.begin() as conn:
        r = await conn.execute(text("SELECT id FROM documents"))
        return {row[0] for row in r}


def main():
    import chromadb

    valid = asyncio.run(_valid_document_ids())
    print(f"PostgreSQL 现有文档 id: {sorted(valid) if valid else '(无)'}")

    client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    try:
        col = client.get_collection("eduraq_chunks")
    except Exception:
        print("ChromaDB collection 'eduraq_chunks' 不存在，无需清理")
        return

    total = col.count()
    print(f"清理前向量数: {total}")
    if total == 0:
        print("空集合，无需清理")
        return

    data = col.get(include=["metadatas"], limit=total)
    orphan_ids = []
    orphan_docs = set()
    for vid, md in zip(data["ids"], data["metadatas"]):
        did = md.get("document_id")
        if did not in valid:
            orphan_ids.append(vid)
            orphan_docs.add(did)

    print(f"孤儿文档 id 数: {len(orphan_docs)}, 孤儿向量数: {len(orphan_ids)}")
    if not orphan_ids:
        print("无孤儿向量，ChromaDB 已与 PostgreSQL 一致")
        return

    # 分批删除，避免单次 id 列表过大
    batch = 500
    for i in range(0, len(orphan_ids), batch):
        col.delete(ids=orphan_ids[i : i + batch])

    print(f"清理后向量数: {col.count()}")
    print("ChromaDB 已与 PostgreSQL documents 表同步")


if __name__ == "__main__":
    main()
