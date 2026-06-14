"""add_thread_id_to_qa_history

Revision ID: ae00e4559774
Revises: ad6e71da95c4
Create Date: 2026-06-14 15:03:37.708447

NOTE: LangGraph checkpoint tables (checkpoints, checkpoint_blobs, checkpoint_writes,
checkpoint_migrations) are managed by AsyncPostgresSaver, NOT by ORM. The
autogenerator was explicitly told to ignore them — only qa_history changes here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'ae00e4559774'
down_revision: Union[str, None] = 'ad6e71da95c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Only add thread_id column — LangGraph checkpoint tables managed by AsyncPostgresSaver, not ORM
    op.add_column('qa_history', sa.Column('thread_id', sa.String(length=36), nullable=True, comment='LangGraph thread_id for session grouping'))
    op.create_index(op.f('ix_qa_history_thread_id'), 'qa_history', ['thread_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_qa_history_thread_id'), table_name='qa_history')
    op.drop_column('qa_history', 'thread_id')
