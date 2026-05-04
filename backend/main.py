import os
import asyncio
import random
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import engine, Base, SessionLocal, get_db
from models import User, Conversation, Message, Contact, MessageDirection, ReadStatus, MessageType, ConversationStatus
from websocket_manager import manager
from auth import SECRET_KEY, ALGORITHM, cleanup_expired_tokens, cleanup_old_login_attempts
from seed_data import seed
from migrate_merge_duplicates import run_migration as run_phone_migration

from routers import auth as auth_router
from routers import conversations, messages, contacts, campaigns, agents, templates, dashboard, labels, webhook
from whatsapp import init_phone_numbers


# Mock incoming messages for demo
MOCK_MESSAGES = [
    "שלום, אני צריך עזרה",
    "מתי אפשר לקבל שירות?",
    "תודה על התגובה המהירה!",
    "יש לי שאלה נוספת",
    "אפשר לדבר עם מישהו?",
    "קיבלתי את ההודעה שלכם",
    "מעוניין במידע נוסף",
    "האם יש מבצע כרגע?",
    "אני מחכה לתשובה",
    "זה דחוף, בבקשה",
]

mock_task = None


async def mock_incoming_messages():
    """Simulate incoming WhatsApp messages every 30 seconds for demo."""
    while True:
        await asyncio.sleep(30)
        try:
            db = SessionLocal()
            # Pick a random open/in_progress conversation
            convs = db.query(Conversation).filter(
                Conversation.status.in_([ConversationStatus.open, ConversationStatus.in_progress])
            ).all()
            if not convs:
                db.close()
                continue

            conv = random.choice(convs)
            content = random.choice(MOCK_MESSAGES)

            msg = Message(
                conversation_id=conv.id,
                content=content,
                message_type=MessageType.text,
                direction=MessageDirection.inbound,
                sent_by=None,
                is_read=False,
                read_status=ReadStatus.read,
                is_internal_note=False,
                created_at=datetime.utcnow()
            )
            db.add(msg)
            conv.last_message_at = datetime.utcnow()
            db.commit()
            db.refresh(msg)

            # Build response data
            contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
            msg_data = {
                "type": "new_message",
                "conversation_id": conv.id,
                "message": {
                    "id": msg.id,
                    "conversation_id": conv.id,
                    "content": content,
                    "message_type": "text",
                    "media_url": None,
                    "direction": "inbound",
                    "sent_by": None,
                    "sender_name": contact.name if contact else None,
                    "is_read": False,
                    "read_status": "read",
                    "is_internal_note": False,
                    "deleted_at": None,
                    "created_at": msg.created_at.isoformat()
                }
            }

            # Notify owner and admins
            notify = set()
            if conv.owner_id:
                notify.add(conv.owner_id)
            if conv.shared_with:
                notify.update(conv.shared_with)
            # Notify all admins
            from models import UserRole
            admin_users = db.query(User).filter(User.role == UserRole.admin).all()
            for a in admin_users:
                notify.add(a.id)

            await manager.send_to_users(list(notify), msg_data)

            db.close()
        except Exception as e:
            print(f"Mock message error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (works for both SQLite and PostgreSQL)
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")

    # Seed data
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()

    # Run phone normalization & duplicate merge (safe to run multiple times)
    db = SessionLocal()
    try:
        run_phone_migration(db)
    except Exception as e:
        print(f"⚠️ Phone migration error (non-fatal): {e}")
    finally:
        db.close()

    # Initialize WhatsApp phone numbers
    init_phone_numbers()

    # Start mock message task (disable when WhatsApp is connected)
    global mock_task
    if not os.getenv("WHATSAPP_TOKEN"):
        mock_task = asyncio.create_task(mock_incoming_messages())
    else:
        print("✅ WhatsApp Cloud API connected — mock messages disabled")

    # Start WebSocket keepalive ping loop
    ping_task = asyncio.create_task(manager.start_ping_loop())
    print("✅ WebSocket keepalive started (ping every 25s)")

    # Start memory cleanup task (every 10 minutes)
    async def memory_cleanup_loop():
        while True:
            await asyncio.sleep(600)  # 10 minutes
            cleanup_expired_tokens()
            cleanup_old_login_attempts()

    cleanup_task = asyncio.create_task(memory_cleanup_loop())
    print("✅ Memory cleanup scheduled (every 10 min)")

    yield

    # Cleanup
    ping_task.cancel()
    cleanup_task.cancel()
    if mock_task:
        mock_task.cancel()


app = FastAPI(
    title="ChatFlow CRM",
    lifespan=lifespan,
    docs_url=None if os.getenv("ENV") == "production" else "/docs",     # Hide docs in production
    redoc_url=None if os.getenv("ENV") == "production" else "/redoc",
)

# ─── CORS — Restrict in production ──────────────────────────────
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Security Headers Middleware ─────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # XSS Protection
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Content Security Policy
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:;"
        # Strict Transport Security (HTTPS only)
        if os.getenv("ENV") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Remove server header
        if "server" in response.headers:
            del response.headers["server"]
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ─── Request Size Limiter ────────────────────────────────────────
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    MAX_BODY_SIZE = 10 * 1024 * 1024  # 10MB max

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY_SIZE:
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"}
            )
        return await call_next(request)

app.add_middleware(RequestSizeLimitMiddleware)


# Include routers
app.include_router(auth_router.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(contacts.router)
app.include_router(campaigns.router)
app.include_router(agents.router)
app.include_router(templates.router)
app.include_router(labels.router)
app.include_router(dashboard.router)
app.include_router(webhook.router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        if not user_id:
            await websocket.close(code=4001)
            return
    except (JWTError, Exception):
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                # Client sends "pong" in response to our ping — connection is alive
            except asyncio.TimeoutError:
                # No message in 60s — check if connection is still alive
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break  # Connection dead
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user_id)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "ChatFlow CRM"}


# ─── Serve Frontend (Production / Render) ──────────────────────
if os.getenv("SERVE_FRONTEND") == "true":
    from starlette.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

    if os.path.isdir(STATIC_DIR):
        # Serve static assets (JS, CSS, images)
        app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

        # Catch-all: serve index.html for SPA routing
        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            file_path = os.path.join(STATIC_DIR, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(STATIC_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
