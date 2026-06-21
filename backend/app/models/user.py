from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Table, UniqueConstraint
from sqlalchemy.orm import relationship

from ..core.database import Base


user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    codename = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)

    roles = relationship("RolePermission", back_populates="permission")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),)

    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    role = relationship("Role", back_populates="permissions")
    permission = relationship("Permission", back_populates="roles")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(200), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    avatar = Column(String(500), nullable=True)
    language_preference = Column(String(10), default="zh")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    roles = relationship("Role", secondary=user_roles, back_populates="users")

    created_tasks = relationship(
        "TranslationTask",
        foreign_keys="TranslationTask.created_by_id",
        back_populates="created_by",
    )
    assigned_tasks = relationship(
        "TranslationTask",
        foreign_keys="TranslationTask.assignee_id",
        back_populates="assignee",
    )
    reviews = relationship(
        "TranslationReview",
        foreign_keys="TranslationReview.reviewer_id",
        back_populates="reviewer",
    )

    def has_role(self, role_name: str) -> bool:
        return any(role.name == role_name for role in self.roles)

    def has_permission(self, codename: str) -> bool:
        for role in self.roles:
            for rp in role.permissions:
                if rp.permission.codename == codename:
                    return True
        return False
