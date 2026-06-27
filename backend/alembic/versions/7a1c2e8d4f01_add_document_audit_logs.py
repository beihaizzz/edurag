"""add document_audit_logs table

Revision ID: 7a1c2e8d4f01
Revises: 3068c8bfa5fb
Create Date: 2026-06-24 10:00:00.000000

新增 document_audit_logs 表，存储文档审核完整轨迹：
- 每次 approve/reject 操作留一行
- 与 documents 表 CASCADE 关联（删除文档时同步清理）
- 与 audit_logs 通用日志区分：此表专记审核动作，可按 document_id 回溯
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7a1c2e8d4f01"
down_revision: Union[str, None] = "3068c8bfa5fb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("auditor_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("previous_status", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["auditor_id"], ["users.id"]),
    )
    op.create_index(
        "ix_document_audit_logs_document_id",
        "document_audit_logs",
        ["document_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_audit_logs_document_id", table_name="document_audit_logs")
    op.drop_table("document_audit_logs")
