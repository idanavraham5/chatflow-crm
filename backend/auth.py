"""
Authentication & Security Module — ChatFlow CRM
=================================================
- bcrypt with 14 rounds (industry best practice)
- JWT with short expiration + refresh tokens
- Rate limiting on login attempts
- Audit logging for sensitive actions
- Token blacklist for logout
- Input sanitization
"""

import os
import re
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Set
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import User

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

# ─── Security Logger ────────────────────────────────────────────
audit_logger = logging.getLogger("chatflow.audit")
audit_logger.setLevel(logging.INFO)
if not audit_logger.handlers:
    handler = logging.FileHandler("audit.log", encoding="utf-8")
    handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    audit_logger.addHandler(handler)

# ─── Token Blacklist (in-memory with auto-cleanup) ──────────────
_token_blacklist: dict = {}  # {token: expiry_datetime}

def blacklist_token(token: str):
    # Token expires after ACCESS_TOKEN_EXPIRE_MINUTES — no need to keep forever
    expiry = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES + 5)
    _token_blacklist[token] = expiry

def is_token_blacklisted(token: str) -> bool:
    return token in _token_blacklist

def cleanup_expired_tokens():
    """Remove expired tokens from blacklist to free memory."""
    now = datetime.utcnow()
    expired = [t for t, exp in _token_blacklist.items() if now > exp]
    for t in expired:
        _token_blacklist.pop(t, None)
    if expired:
        print(f"🧹 Cleaned {len(expired)} expired tokens from blacklist")

# ─── Login Rate Limiting ────────────────────────────────────────
_login_attempts: dict = {}  # {ip: {"count": int, "last_attempt": datetime, "locked_until": datetime}}

def get_real_ip(request: Request) -> str:
    """Get real client IP behind reverse proxy (Render, nginx, etc.)."""
    # X-Forwarded-For: client, proxy1, proxy2
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"

def check_rate_limit(ip: str) -> None:
    """Check if IP is rate-limited. Raises 429 if too many attempts."""
    now = datetime.utcnow()
    record = _login_attempts.get(ip)

    if not record:
        return

    # Check if currently locked out
    if record.get("locked_until") and now < record["locked_until"]:
        remaining = (record["locked_until"] - now).seconds
        audit_logger.warning(f"RATE_LIMIT | IP={ip} | Blocked login attempt during lockout ({remaining}s remaining)")
        raise HTTPException(
            status_code=429,
            detail=f"חשבון נעול. נסה שוב בעוד {remaining} שניות"
        )

    # Reset if lockout expired
    if record.get("locked_until") and now >= record["locked_until"]:
        _login_attempts[ip] = {"count": 0, "last_attempt": now, "locked_until": None}

def record_failed_login(ip: str) -> None:
    """Record a failed login attempt."""
    now = datetime.utcnow()
    record = _login_attempts.get(ip, {"count": 0, "last_attempt": now, "locked_until": None})
    record["count"] += 1
    record["last_attempt"] = now

    if record["count"] >= MAX_LOGIN_ATTEMPTS:
        record["locked_until"] = now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        audit_logger.warning(f"LOCKOUT | IP={ip} | Account locked after {MAX_LOGIN_ATTEMPTS} failed attempts")

    _login_attempts[ip] = record

def record_successful_login(ip: str) -> None:
    """Clear failed attempts on successful login."""
    _login_attempts.pop(ip, None)

def cleanup_old_login_attempts():
    """Remove stale login attempt records older than 1 hour."""
    now = datetime.utcnow()
    stale = [ip for ip, rec in _login_attempts.items()
             if (now - rec.get("last_attempt", now)).total_seconds() > 3600]
    for ip in stale:
        _login_attempts.pop(ip, None)
    if stale:
        print(f"🧹 Cleaned {len(stale)} stale login attempt records")


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

    # Also check query parameter (for media proxy requests from <img> tags)
    if not token:
        token = request.query_params.get("token")

    if not token:
        raise credentials_exception

    # Check blacklist
    if is_token_blacklisted(token):
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
