"""fix_feedback_fk_to_user_sessions

Revision ID: 3068c8bfa5fb
Revises: ad6e71da95c4
Create Date: 2026-06-15 17:59:00.170528

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3068c8bfa5fb'
down_revision: Union[str, None] = 'ad6e71da95c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """将 feedback.qa_id 外键从 qa_history 改为 user_sessions"""
    op.drop_constraint('feedback_qa_id_fkey', 'feedback', type_='foreignkey')
    op.create_foreign_key(None, 'feedback', 'user_sessions', ['qa_id'], ['id'])


def downgrade() -> None:
    """回退：恢复 feedback.qa_id 外键到 qa_history"""
    op.drop_constraint(None, 'feedback', type_='foreignkey')
    op.create_foreign_key('feedback_qa_id_fkey', 'feedback', 'qa_history', ['qa_id'], ['id'])
