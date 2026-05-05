"""
Authentication & Security Module — ChatFlow CRM
=================================================
- bcrypt with 14 rounds (industry best practice)
- JWT with short expiration + refresh tokens
- Rate limiting on login attempts (DB-backed, survives restarts)
- Audit logging for sensitive actions
- Token blacklist for logout (DB-backed, survives restarts)
- Input sanitization
"""

import os
import re
import secrets
import logging
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Set
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import User, TokenBlacklist, LoginAttempt

# ─── Configuration ───────────────────────────────────────────────
# CRITICAL: In production, set these as environment variables!
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(64))
REFRESH_SECRET_KEY = os.getenv("REFRESH_SECRET_KEY", secrets.token_urlsafe(64))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # Short-lived access token (was 24h!)
REFRESH_TOKEN_EXPIRE_DAYS = 7    # Refresh token lasts 7 days
BCRYPT_ROUNDS = 14               # Higher = slower = more secure (default is 12)
MAX_LOGIN_ATTEMPTS = 5           # Lock after 5 failed attempts
LOGIN_LOCKOUT_MINUTES = 15       # Lockout duration

# ─── Security Logger (stdout — works on ephemeral filesystems like Render) ──
audit_logger = logging.getLogger("chatflow.audit")
audit_logger.setLevel(logging.INFO)
if not audit_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s | AUDIT | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    audit_logger.addHandler(handler)

# ─── Token Blacklist (DB-backed — survives restarts) ──────────────

def _hash_token(token: str) -> str:
    """Hash token for storage — we don't need to store the raw JWT."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def blacklist_token(token: str, db: Session = None):
    """Add token to blacklist. If no db session, get one."""
    if db is None:
        db = next(get_db())
        try:
            _blacklist_token_impl(token, db)
        finally:
            db.close()
    else:
        _blacklist_token_impl(token, db)

def _blacklist_token_impl(token: str, db: Session):
    token_hash = _hash_token(token)
    existing = db.query(TokenBlacklist).filter(TokenBlacklist.token_hash == token_hash).first()
    if not existing:
        entry = TokenBlacklist(
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES + 5)
        )
        db.add(entry)
        db.commit()

def is_token_blacklisted(token: str, db: Session = None) -> bool:
    if db is None:
        db = next(get_db())
        try:
            return _is_blacklisted_impl(token, db)
        finally:
            db.close()
    return _is_blacklisted_impl(token, db)

def _is_blacklisted_impl(token: str, db: Session) -> bool:
    token_hash = _hash_token(token)
    return db.query(TokenBlacklist).filter(TokenBlacklist.token_hash == token_hash).first() is not None

def cleanup_expired_tokens():
    """Remove expired tokens from blacklist table."""
    db = next(get_db())
    try:
        now = datetime.now(timezone.utc)
        deleted = db.query(TokenBlacklist).filter(TokenBlacklist.expires_at < now).delete()
        db.commit()
        if deleted:
            print(f"🧹 Cleaned {deleted} expired tokens from blacklist")
    finally:
        db.close()

# ─── Login Rate Limiting (DB-backed — survives restarts) ────────

def get_real_ip(request: Request) -> str:
    """Get real client IP behind reverse proxy (Render, nginx, etc.)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"

def check_rate_limit(ip: str, db: Session = None) -> None:
    """Check if IP is rate-limited. Raises 429 if too many attempts."""
    if db is None:
        db = next(get_db())
        try:
            _check_rate_limit_impl(ip, db)
        finally:
            db.close()
    else:
        _check_rate_limit_impl(ip, db)

def _check_rate_limit_impl(ip: str, db: Session):
    now = datetime.now(timezone.utc)
    record = db.query(LoginAttempt).filter(LoginAttempt.ip_address == ip).first()
    if not record:
        return

    # Check if currently locked out
    if record.locked_until and now < record.locked_until:
        remaining = int((record.locked_until - now).total_seconds())
        audit_logger.warning(f"RATE_LIMIT | IP={ip} | Blocked login attempt during lockout ({remaining}s remaining)")
        raise HTTPException(
            status_code=429,
            detail=f"חשבון נעול. נסה שוב בעוד {remaining} שניות"
        )

    # Reset if lockout expired
    if record.locked_until and now >= record.locked_until:
        record.attempt_count = 0
        record.locked_until = None
        db.commit()

def record_failed_login(ip: str, db: Session = None) -> None:
    """Record a failed login attempt."""
    if db is None:
        db = next(get_db())
        try:
            _record_failed_impl(ip, db)
        finally:
            db.close()
    else:
        _record_failed_impl(ip, db)

def _record_failed_impl(ip: str, db: Session):
    now = datetime.now(timezone.utc)
    record = db.query(LoginAttempt).filter(LoginAttempt.ip_address == ip).first()
    if not record:
        record = LoginAttempt(ip_address=ip, attempt_count=0, last_attempt=now)
        db.add(record)
    record.attempt_count += 1
    record.last_attempt = now

    if record.attempt_count >= MAX_LOGIN_ATTEMPTS:
        record.locked_until = now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        audit_logger.warning(f"LOCKOUT | IP={ip} | Account locked after {MAX_LOGIN_ATTEMPTS} failed attempts")

    db.commit()

def record_successful_login(ip: str, db: Session = None) -> None:
    """Clear failed attempts on successful login."""
    if db is None:
        db = next(get_db())
        try:
            db.query(LoginAttempt).filter(LoginAttempt.ip_address == ip).delete()
            db.commit()
        finally:
            db.close()
    else:
        db.query(LoginAttempt).filter(LoginAttempt.ip_address == ip).delete()
        db.commit()

def cleanup_old_login_attempts():
    """Remove stale login attempt records older than 1 hour."""
    db = next(get_db())
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=1)
        deleted = db.query(LoginAttempt).filter(LoginAttempt.last_attempt < cutoff).delete()
        db.commit()
        if deleted:
            print(f"🧹 Cleaned {deleted} stale login attempt records")
    finally:
        db.close()


# ─── Password Hashing (bcrypt with configurable rounds) ─────────
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def validate_password_strength(password: str) -> bool:
    """Enforce minimum password security requirements."""
    if len(password) < 8:
        return False
    if not re.search(r"[A-Za-z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    return True


# ─── JWT Token Creation ─────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh"
    })
    return jwt.encode(to_encode, REFRESH_SECRET_KEY, algorithm=ALGORITHM)

def verify_refresh_token(token: str) -> Optional[int]:
    """Verify refresh token and return user_id, or None if invalid."""
    try:
        payload = jwt.decode(token, REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        user_id = payload.get("sub")
        return int(user_id) if user_id else None
    except JWTError:
        return None


# ─── Input Sanitization ─────────────────────────────────────────
def sanitize_input(text: str, max_length: int = 5000) -> str:
    """Remove potentially dangerous characters from user input."""
    if not text:
        return text
    # Truncate to max length
    text = text[:max_length]
    # Remove null bytes
    text = text.replace("\x00", "")
    return text

def sanitize_search(query: str) -> str:
    """Sanitize search queries — prevent SQL injection via LIKE patterns."""
    if not query:
        return query
    # Escape SQL LIKE wildcards
    query = query.replace("%", "\\%").replace("_", "\\_")
    return sanitize_input(query, max_length=200)


# ─── Authentication Dependency ──────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)

def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = None

    # Extract token
    if credentials and credentials.credentials:
        token = credentials.credentials

    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:]

    # Also check query parameter — restricted to media proxy routes only
    if not token:
        request_path = request.url.path
        if "/media/" in request_path or "/webhook/whatsapp/media/" in request_path:
            token = request.query_params.get("token")

    if not token:
        raise credentials_exception

    # Check blacklist (DB-backed)
    if is_token_blacklisted(token, db):
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Verify token type
        if payload.get("type") != "access":
            raise credentials_exception

        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise credentials_exception
        user_id = int(user_id_raw)
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        audit_logger.warning(f"AUTH_DENIED | user_id={user_id} | Inactive user attempted access")
        raise credentials_exception

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role.value != "admin":
        audit_logger.warning(f"ADMIN_DENIED | user_id={current_user.id} | Non-admin attempted admin action")
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ─── Audit Helpers ───────────────────────────────────────────────
def log_action(user_id: int, action: str, details: str = ""):
    audit_logger.info(f"ACTION | user_id={user_id} | {action} | {details}")
