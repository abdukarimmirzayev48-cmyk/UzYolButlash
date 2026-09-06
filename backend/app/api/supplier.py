"""Ta'minotchilar ma'lumotnomasi: CRUD va tegishli yozuvlari."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.db.session import get_db
from backend.app.models.supplier import (
    Supplier,
    SupplierAddress,
    SupplierBankAccount,
    SupplierContact,
    SupplierDocument,
    SupplierNote,
)
from backend.app.schemas.client import Page
from backend.app.schemas.supplier import (
    SupplierAddressBase,
    SupplierAddressRead,
    SupplierAddressUpdate,
    SupplierBankAccountBase,
    SupplierBankAccountRead,
    SupplierBankAccountUpdate,
    SupplierContactBase,
    SupplierContactRead,
    SupplierContactUpdate,
    SupplierCreate,
    SupplierDetail,
    SupplierDocumentCreate,
    SupplierDocumentRead,
    SupplierDocumentUpdate,
    SupplierListItem,
    SupplierNoteCreate,
    SupplierNoteRead,
    SupplierNoteUpdate,
    SupplierRead,
    SupplierUpdate,
)
from backend.app.services.auth import require_edit

supplier_router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


def update_model(instance: Any, data: dict[str, Any]) -> Any:
    for key, value in data.items():
        setattr(instance, key, value)
    return instance


def get_supplier_or_404(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ta'minotchi topilmadi.")
    return supplier


def get_supplier_child_or_404(db: Session, model: Any, supplier_id: int, item_id: int):
    item = db.get(model, item_id)
    if not item or item.supplier_id != supplier_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Element topilmadi.")
    return item


def load_supplier_detail(db: Session, supplier_id: int) -> Supplier:
    supplier = db.scalars(
        select(Supplier)
        .where(Supplier.id == supplier_id)
        .options(
            selectinload(Supplier.contacts),
            selectinload(Supplier.addresses),
            selectinload(Supplier.bank_accounts),
            selectinload(Supplier.documents),
            selectinload(Supplier.notes_history),
        )
    ).first()
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ta'minotchi topilmadi.")
    return supplier


def serialize_supplier_list_item(supplier: Supplier) -> SupplierListItem:
    primary_contact = next((item for item in supplier.contacts if item.is_primary), supplier.contacts[0] if supplier.contacts else None)
    loading_address = next((item for item in supplier.addresses if item.address_type.value == "loading"), supplier.addresses[0] if supplier.addresses else None)
    return SupplierListItem(
        **SupplierRead.model_validate(supplier).model_dump(),
        primary_contact=primary_contact,
        primary_region=loading_address.region if loading_address else None,
        primary_loading_address=loading_address.address if loading_address else None,
        last_activity=supplier.updated_at,
    )


@supplier_router.get("", response_model=Page[SupplierListItem])
def list_suppliers(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
):
    stmt = select(Supplier).options(selectinload(Supplier.contacts), selectinload(Supplier.addresses))
    if search:
        value = f"%{search}%"
        stmt = stmt.where(or_(Supplier.name.ilike(value), Supplier.inn.ilike(value), Supplier.phone.ilike(value), Supplier.email.ilike(value)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    suppliers = db.scalars(stmt.order_by(Supplier.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    return Page(items=[serialize_supplier_list_item(supplier) for supplier in suppliers], total=total, page=page, page_size=page_size)


@supplier_router.post("", response_model=SupplierDetail, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    supplier = Supplier(**payload.model_dump(exclude={"first_contact", "address", "bank_account"}))
    db.add(supplier)
    db.flush()
    if payload.first_contact:
        supplier.contacts.append(SupplierContact(**payload.first_contact.model_dump()))
    if payload.address:
        supplier.addresses.append(SupplierAddress(**payload.address.model_dump()))
    if payload.bank_account:
        supplier.bank_accounts.append(SupplierBankAccount(**payload.bank_account.model_dump()))
    db.commit()
    return load_supplier_detail(db, supplier.id)


@supplier_router.get("/{supplier_id}", response_model=SupplierDetail)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    return load_supplier_detail(db, supplier_id)


@supplier_router.patch("/{supplier_id}", response_model=SupplierDetail, dependencies=[Depends(require_edit("taminot"))])
def update_supplier(supplier_id: int, payload: SupplierUpdate, db: Session = Depends(get_db)):
    supplier = get_supplier_or_404(db, supplier_id)
    update_model(supplier, payload.model_dump(exclude_unset=True))
    db.commit()
    return load_supplier_detail(db, supplier_id)


@supplier_router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("taminot"))])
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = get_supplier_or_404(db, supplier_id)
    db.delete(supplier)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/contacts", response_model=SupplierContactRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_supplier_contact(supplier_id: int, payload: SupplierContactBase, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    if payload.is_primary:
        db.query(SupplierContact).filter(SupplierContact.supplier_id == supplier_id).update({SupplierContact.is_primary: False}, synchronize_session=False)
    item = SupplierContact(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/contacts/{item_id}", response_model=SupplierContactRead, dependencies=[Depends(require_edit("taminot"))])
def update_supplier_contact(supplier_id: int, item_id: int, payload: SupplierContactUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierContact, supplier_id, item_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        db.query(SupplierContact).filter(SupplierContact.supplier_id == supplier_id, SupplierContact.id != item_id).update({SupplierContact.is_primary: False}, synchronize_session=False)
    update_model(item, data)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/contacts/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("taminot"))])
def delete_supplier_contact(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierContact, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/addresses", response_model=SupplierAddressRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_supplier_address(supplier_id: int, payload: SupplierAddressBase, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    item = SupplierAddress(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/addresses/{item_id}", response_model=SupplierAddressRead, dependencies=[Depends(require_edit("taminot"))])
def update_supplier_address(supplier_id: int, item_id: int, payload: SupplierAddressUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierAddress, supplier_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/addresses/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("taminot"))])
def delete_supplier_address(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierAddress, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/bank-accounts", response_model=SupplierBankAccountRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_supplier_bank_account(supplier_id: int, payload: SupplierBankAccountBase, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    if payload.is_primary:
        db.query(SupplierBankAccount).filter(SupplierBankAccount.supplier_id == supplier_id).update({SupplierBankAccount.is_primary: False}, synchronize_session=False)
    item = SupplierBankAccount(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/bank-accounts/{item_id}", response_model=SupplierBankAccountRead, dependencies=[Depends(require_edit("taminot"))])
def update_supplier_bank_account(supplier_id: int, item_id: int, payload: SupplierBankAccountUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierBankAccount, supplier_id, item_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        db.query(SupplierBankAccount).filter(SupplierBankAccount.supplier_id == supplier_id, SupplierBankAccount.id != item_id).update({SupplierBankAccount.is_primary: False}, synchronize_session=False)
    update_model(item, data)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/bank-accounts/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("taminot"))])
def delete_supplier_bank_account(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierBankAccount, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/documents", response_model=SupplierDocumentRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_supplier_document(supplier_id: int, payload: SupplierDocumentCreate, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    item = SupplierDocument(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/documents/{item_id}", response_model=SupplierDocumentRead, dependencies=[Depends(require_edit("taminot"))])
def update_supplier_document(supplier_id: int, item_id: int, payload: SupplierDocumentUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierDocument, supplier_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/documents/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("taminot"))])
def delete_supplier_document(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierDocument, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@supplier_router.post("/{supplier_id}/notes", response_model=SupplierNoteRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_edit("taminot"))])
def create_supplier_note(supplier_id: int, payload: SupplierNoteCreate, db: Session = Depends(get_db)):
    get_supplier_or_404(db, supplier_id)
    item = SupplierNote(supplier_id=supplier_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@supplier_router.patch("/{supplier_id}/notes/{item_id}", response_model=SupplierNoteRead, dependencies=[Depends(require_edit("taminot"))])
def update_supplier_note(supplier_id: int, item_id: int, payload: SupplierNoteUpdate, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierNote, supplier_id, item_id)
    update_model(item, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(item)
    return item


@supplier_router.delete("/{supplier_id}/notes/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_edit("taminot"))])
def delete_supplier_note(supplier_id: int, item_id: int, db: Session = Depends(get_db)):
    item = get_supplier_child_or_404(db, SupplierNote, supplier_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Ekranda ko'rinadigan ustunlar bo'yicha saralash. Kalitlar frontend bilan
# bir xil: bir joyda o'zgarsa, ikkinchisi ham o'zgarishi kerak.
