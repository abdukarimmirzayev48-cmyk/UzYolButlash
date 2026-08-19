from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.session import Base
from backend.app.models.user import User


class AuditLog(Base):
    """Who did what, recorded by middleware rather than by each endpoint.

    The point of putting it in middleware is coverage: there are ~180 write
    endpoints and more get added, so anything that has to be remembered at each
    one would be incomplete within a month.

    The user's name is copied in, not just referenced. A log that says
    "user #7" stops being evidence the day that account is renamed or deleted.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    username: Mapped[str | None] = mapped_column(String(150), index=True)
    full_name: Mapped[str | None] = mapped_column(String(255))

    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    module: Mapped[str | None] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    record_id: Mapped[str | None] = mapped_column(String(64))

    status_code: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    ip_address: Mapped[str | None] = mapped_column(String(64))

    user: Mapped[User | None] = relationship()
