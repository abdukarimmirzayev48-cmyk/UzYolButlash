from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Module keys map to router prefixes, not the coarser nav groups, so
# closely-related pages (e.g. Davomat vs Ijro) can be assigned independently.
MODULE_LABELS = {
    "xodimlar": "Xodimlar",
    "davomat": "Davomat",
    "ijro": "Ijro",
    "sotuv": "Sotuv",
    "yetkazib_berish": "Yetkazib berish",
    "taminot": "Ta'minot",
    "moliya": "Moliya",
}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tizimga kirish talab qilinadi.")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tizimga kirish talab qilinadi.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Faqat administrator uchun.")
    return user


def require_edit(module_key: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.is_admin or module_key in (user.edit_modules or []):
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sizda bu amalni bajarish huquqi yo'q.")

    return dependency
