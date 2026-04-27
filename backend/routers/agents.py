from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import User
from schemas import UserCreate, UserResponse, UserUpdate, ResetPasswordRequest
from auth import (
    get_current_user, require_admin, get_password_hash,
    validate_password_strength, log_action, sanitize_input
)

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("/", response_model=List[UserResponse])
def list_agents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).order_by(User.name).all()


@router.post("/", response_model=UserResponse)
def create_agent(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    # Sanitize inputs
    name = sanitize_input(data.name, max_length=100)
    username = sanitize_input(data.username, max_length=50)

    if not validate_password_strength(data.password):
        raise HTTPException(
            status_code=400,
            detail="הסיסמה חייבת להכיל לפחות 8 תווים, אותיות ומספרים"
        )

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        name=name,
        username=username,
        password_hash=get_password_hash(data.password),
        role=data.role
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(current_user.id, "AGENT_CREATED", f"new_agent={username} role={data.role}")
    return user


@router.patch("/{agent_id}", response_model=UserResponse)
def update_agent(
    agent_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.value != "admin" and current_user.id != agent_id:
        raise HTTPException(status_code=403, detail="Access denied")

    user = db.query(User).filter(User.id == agent_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = data.model_dump(exclude_unset=True)

    # Sanitize string fields
    if "name" in update_data and update_data["name"]:
        update_data["name"] = sanitize_input(update_data["name"], max_length=100)

    for key, value in update_data.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)

    log_action(current_user.id, "AGENT_UPDATED", f"agent_id={agent_id} fields={list(update_data.keys())}")
    return user


@router.post("/{agent_id}/reset-password")
def reset_password(
    agent_id: int,
    data: ResetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if not validate_password_strength(data.new_password):
        raise HTTPException(
            status_code=400,
            detail="הסיסמה חייבת להכיל לפחות 8 תווים, אותיות ומספרים"
        )

    user = db.query(User).filter(User.id == agent_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Agent not found")

    user.password_hash = get_password_hash(data.new_password)
    db.commit()

    log_action(current_user.id, "PASSWORD_RESET", f"target_agent={agent_id} ({user.username})")
    return {"message": "Password reset successfully"}
