"""add_version_control_models

Revision ID: a1b2c3d4e5f6
Revises: 4ef7ac13bffb
Create Date: 2026-06-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '4ef7ac13bffb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('content_versions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('entry_id', sa.Integer(), nullable=False),
        sa.Column('language_code', sa.String(length=10), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('field_values', sa.JSON(), nullable=True),
        sa.Column('title', sa.String(length=500), nullable=True),
        sa.Column('slug', sa.String(length=500), nullable=True),
        sa.Column('is_published', sa.Boolean(), nullable=True),
        sa.Column('change_summary', sa.String(length=500), nullable=True),
        sa.Column('created_by', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['entry_id'], ['content_entries.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entry_id', 'language_code', 'version_number', name='uq_version_entry_lang_num'),
    )
    with op.batch_alter_table('content_versions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_content_versions_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_content_versions_language_code'), ['language_code'], unique=False)
        batch_op.create_index('ix_content_versions_entry_lang', ['entry_id', 'language_code'], unique=False)

    with op.batch_alter_table('content_entries', schema=None) as batch_op:
        batch_op.add_column(sa.Column('current_version_number', sa.Integer(), nullable=True, server_default='0'))

    with op.batch_alter_table('entry_translations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('draft_field_values', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('draft_title', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('draft_slug', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('published_version_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_entry_translations_published_version', 'content_versions', ['published_version_id'], ['id'], ondelete='SET NULL')

    op.execute("""
        UPDATE entry_translations SET
            draft_field_values = field_values,
            draft_title = title,
            draft_slug = slug
    """)

    with op.batch_alter_table('entry_translations', schema=None) as batch_op:
        batch_op.drop_index('ix_entry_translations_slug')
        batch_op.create_index(batch_op.f('ix_entry_translations_draft_slug'), ['draft_slug'], unique=False)
        batch_op.drop_column('field_values')
        batch_op.drop_column('title')
        batch_op.drop_column('slug')


def downgrade() -> None:
    with op.batch_alter_table('entry_translations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('slug', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('title', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('field_values', sa.JSON(), nullable=True))

    op.execute("""
        UPDATE entry_translations SET
            field_values = draft_field_values,
            title = draft_title,
            slug = draft_slug
    """)

    with op.batch_alter_table('entry_translations', schema=None) as batch_op:
        batch_op.drop_index('ix_entry_translations_draft_slug')
        batch_op.create_index(batch_op.f('ix_entry_translations_slug'), ['slug'], unique=True)
        batch_op.drop_column('published_version_id')
        batch_op.drop_column('draft_slug')
        batch_op.drop_column('draft_title')
        batch_op.drop_column('draft_field_values')

    with op.batch_alter_table('content_entries', schema=None) as batch_op:
        batch_op.drop_column('current_version_number')

    with op.batch_alter_table('content_versions', schema=None) as batch_op:
        batch_op.drop_index('ix_content_versions_entry_lang')
        batch_op.drop_index(batch_op.f('ix_content_versions_language_code'))
        batch_op.drop_index(batch_op.f('ix_content_versions_id'))

    op.drop_table('content_versions')
