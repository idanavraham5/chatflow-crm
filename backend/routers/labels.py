from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import User, Label
from schemas import LabelCreate, LabelUpdate, LabelResponse
from auth import get_current_user, require_admin, sanitize_input

router = APIRouter(prefix="/api/labels", tags=["labels"])


@router.get("/", response_model=List[LabelResponse])
def list_labels(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Label).order_by(Label.name).all()


@router.post("/", response_model=LabelResponse)
def create_label(
    data: LabelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    name = sanitize_input(data.name, max_length=50)

    existing = db.query(Label).filter(Label.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Label already exists")

    label = Label(
        name=name,
        color=data.color[:7],
        created_by=current_user.id
    )
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


@router.patch("/{label_id}", response_model=LabelResponse)
def update_label(
    label_id: int,
    data: LabelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    label = db.query(Label).filter(Label.id == label_id).first()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    if data.name is not None:
        label.name = sanitize_input(data.name, max_length=50)
    if data.color is not None:
        label.color = data.color[:7]

    db.commit()
    db.refresh(label)
    return label


@router.delete("/{label_id}")
def delete_label(
    label_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    label = db.query(Label).filter(Label.id == label_id).first()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    db.delete(label)
    db.commit()
    return {"message": "Deleted"}
