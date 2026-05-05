from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from database import get_db
from models import User, Contact
from schemas import ContactCreate, ContactUpdate, ContactResponse
from auth import get_current_user, sanitize_search
from whatsapp import normalize_phone, format_phone_display

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("/", response_model=List[ContactResponse])
def list_contacts(
    search: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Contact)
    if search:
        safe_search = sanitize_search(search)
        query = query.filter(
            or_(
                Contact.name.ilike(f"%{safe_search}%"),
                Contact.phone.ilike(f"%{safe_search}%")
            )
        )
    if category:
        query = query.filter(Contact.category == category)
    return query.order_by(Contact.name).all()


@router.get("/{contact_id}", response_model=ContactResponse)
def get_contact(contact_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.post("/", response_model=ContactResponse)
def create_contact(data: ContactCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Normalize phone to consistent display format
    normalized = normalize_phone(data.phone)
    display_phone = format_phone_display(normalized)
    local_no_dash = ("0" + normalized[3:]) if normalized.startswith("972") else normalized

    # Check for duplicates with all possible formats
    existing = db.query(Contact).filter(
        Contact.phone.in_([data.phone, display_phone, normalized, f"+{normalized}", local_no_dash])
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="מספר טלפון כבר קיים במערכת")

    contact_data = data.model_dump()
    contact_data["phone"] = display_phone  # Always store normalized
    contact = Contact(**contact_data)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.patch("/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: int,
    data: ContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(contact, key, value)

    db.commit()
    db.refresh(contact)
    return contact
