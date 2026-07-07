from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProductCategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    notes: str | None = None


class ProductCategoryCreate(ProductCategoryBase):
    pass


class ProductCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = None


class ProductCategoryRead(ProductCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class ProductBase(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=255)
    unit: str = Field(min_length=1, max_length=64)
    notes: str | None = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, min_length=1, max_length=64)
    notes: str | None = None


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: ProductCategoryRead
    created_at: datetime
    updated_at: datetime
