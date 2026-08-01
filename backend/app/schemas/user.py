from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserBase(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    is_admin: bool = False
    edit_modules: list[str] = Field(default_factory=list)
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=6)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=64)
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    is_admin: bool | None = None
    edit_modules: list[str] | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
