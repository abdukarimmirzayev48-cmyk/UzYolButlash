from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.product import Product, ProductCategory
from backend.app.schemas.product import (
    ProductCategoryCreate,
    ProductCategoryRead,
    ProductCategoryUpdate,
    ProductCreate,
    ProductRead,
    ProductUpdate,
)
from backend.app.services.auth import require_edit

categories_router = APIRouter(prefix="/api/product-categories", tags=["product-categories"])
products_router = APIRouter(prefix="/api/products", tags=["products"])


def get_category_or_404(db: Session, category_id: int) -> ProductCategory:
    category = db.get(ProductCategory, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kategoriya topilmadi.")
    return category


def get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mahsulot topilmadi.")
    return product


def load_product(db: Session, product_id: int) -> Product:
    return db.scalars(
        select(Product).where(Product.id == product_id).options(selectinload(Product.category))
    ).first()


@categories_router.get("", response_model=list[ProductCategoryRead])
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(ProductCategory).order_by(ProductCategory.name)).all()


@categories_router.post("", response_model=ProductCategoryRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_category(payload: ProductCategoryCreate, db: Session = Depends(get_db)):
    category = ProductCategory(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@categories_router.patch("/{category_id}", response_model=ProductCategoryRead, dependencies=[Depends(require_edit("sotuv"))])
def update_category(category_id: int, payload: ProductCategoryUpdate, db: Session = Depends(get_db)):
    category = get_category_or_404(db, category_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@categories_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = get_category_or_404(db, category_id)
    db.delete(category)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@products_router.get("", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db), category_id: int | None = None):
    stmt = select(Product).options(selectinload(Product.category))
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    return db.scalars(stmt.order_by(Product.category_id, Product.name)).all()


@products_router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("sotuv"))])
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    get_category_or_404(db, payload.category_id)
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return load_product(db, product.id)


@products_router.get("/{product_id}", response_model=ProductRead)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = load_product(db, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mahsulot topilmadi.")
    return product


@products_router.patch("/{product_id}", response_model=ProductRead, dependencies=[Depends(require_edit("sotuv"))])
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    product = get_product_or_404(db, product_id)
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        get_category_or_404(db, data["category_id"])
    for key, value in data.items():
        setattr(product, key, value)
    db.commit()
    return load_product(db, product_id)


@products_router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("sotuv"))])
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = get_product_or_404(db, product_id)
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
