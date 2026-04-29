from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import LoginRequest, TokenResponse, UserResponse, ResetPasswordRequest
from auth import (
    verify_password, create_access_token, create_refresh_token,
    verify_refresh_token, get_current_user, require_admin,
    get_password_hash, validate_password_strength,
    check_rate_limit, record_failed_login, record_successful_login,
    blacklist_token, log_action, sanitize_input
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "unknown"

    # Check rate limit BEFORE checking credentials
    check_rate_limit(client_ip)

    # Sanitize input
    username = sanitize_input(req.username, max_length=50)

    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(req.password, user.password_hash):
        record_failed_login(client_ip)
        log_action(0, "LOGIN_FAILED", f"IP={client_ip} username={username}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        log_action(user.id, "LOGIN_BLOCKED", f"IP={client_ip} Suspended account")
        raise HTTPException(status_code=403, detail="Account suspended")

    # Success — clear rate limit and generate tokens
    record_successful_login(client_ip)

    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    log_action(user.id, "LOGIN_SUCCESS", f"IP={client_ip}")

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(request: Request, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new access token."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Refresh token required")

    token = auth_header[7:]
    user_id = verify_refresh_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    new_access = create_access_token(data={"sub": str(user.id)})
    new_refresh = create_refresh_token(data={"sub": str(user.id)})

    log_action(user.id, "TOKEN_REFRESH", "")

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer"
    }


@router.post("/logout")
async def logout(request: Request, current_user: User = Depends(get_current_user)):
    """Invalidate the current access token and refresh token."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:]
        blacklist_token(token)

    # Also blacklist refresh token if provided in the request body
    try:
        body = await request.json()
        refresh_token = body.get("refresh_token")
        if refresh_token:
            blacklist_token(refresh_token)
    except Exception:
        pass  # No body or invalid JSON is fine — access token is already blacklisted

    log_action(current_user.id, "LOGOUT", "")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password")
def change_password(
    data: ResetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allow user to change their own password."""
    if not validate_password_strength(data.new_password):
        raise HTTPException(
            status_code=400,
            detail="הסיסמה חייבת להכיל לפחות 8 תווים, אותיות ומספרים"
        )

    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()

    log_action(current_user.id, "PASSWORD_CHANGED", "Self-service")
    return {"message": "Password changed successfully"}
