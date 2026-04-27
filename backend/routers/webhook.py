"""
WhatsApp Cloud API Webhook — receives incoming messages and status updates from Meta.
"""
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from models import (
    Contact, Conversation, Message, User, UserRole,
    ConversationStatus, MessageType, MessageDirection, ReadStatus, CategoryType
)
from websocket_manager import manager
from starlette.responses import Response as StarletteResponse
from whatsapp import (
    WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, parse_webhook_payload, extract_message_content,
    mark_message_as_read, normalize_phone, format_phone_display, get_phone_numbers,
    download_media, get_media_bytes
)
from auth import get_current_user

router = APIRouter(prefix="/api/webhook", tags=["webhook"])


# ─── WhatsApp Phone Numbers API ───────────────────────────────
@router.get("/whatsapp/numbers")
def get_whatsapp_numbers(current_user: User = Depends(get_current_user)):
    """Return configured WhatsApp phone numbers for the frontend."""
    numbers = get_phone_numbers()
    is_connected = bool(WHATSAPP_TOKEN)
    return {
        "connected": is_connected,
        "numbers": [
            {"phone_number_id": pid, "name": info["name"]}
            for pid, info in numbers.items()
        ]
    }


# ─── Webhook Verification (Meta sends GET to verify) ────────────
@router.get("/whatsapp")
def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    """Meta sends a GET request to verify the webhook endpoint."""
    if hub_mode == "subscribe" and hub_verify_token == WHATSAPP_VERIFY_TOKEN:
        print(f"✅ Webhook verified successfully")
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


# ─── Webhook Handler (Meta sends POST with messages/statuses) ───
@router.post("/whatsapp")
async def handle_webhook(request: Request, db: Session = Depends(get_db)):
    """Process incoming WhatsApp messages and status updates."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    events = parse_webhook_payload(payload)

    for event in events:
        if event["type"] == "message":
            await _handle_incoming_message(event, db)
        elif event["type"] == "status":
            await _handle_status_update(event, db)

    # Always return 200 to Meta (they retry on errors)
    return {"status": "ok"}


# ─── Handle Incoming Message ────────────────────────────────────
async def _handle_incoming_message(event: dict, db: Session):
    """Process an incoming message from a customer."""
    from_phone = event["from"]
    contact_name = event.get("contact_name") or from_phone
    phone_number_id = event["phone_number_id"]
    wa_message_id = event["message_id"]
    raw_message = event["message"]

    # Extract message content
    msg_data = extract_message_content(raw_message)

    # Map WhatsApp type to our MessageType
    type_map = {
        "text": MessageType.text,
        "image": MessageType.image,
        "video": MessageType.video,
        "audio": MessageType.audio,
        "voice": MessageType.voice,
        "document": MessageType.file,
        "sticker": MessageType.sticker,
        "location": MessageType.location,
        "contacts": MessageType.contact,
    }
    message_type = type_map.get(msg_data["type"], MessageType.text)

    # ── Find or create contact ──
    display_phone = format_phone_display(from_phone)
    contact = db.query(Contact).filter(Contact.phone == display_phone).first()

    if not contact:
        # Try normalized format too
        normalized = normalize_phone(from_phone)
        contact = db.query(Contact).filter(
            Contact.phone.in_([from_phone, display_phone, normalized, f"+{normalized}"])
        ).first()

    if not contact:
        contact = Contact(
            name=contact_name,
            phone=display_phone,
            category=CategoryType.service
        )
        db.add(contact)
        db.flush()

    # Update contact name if we got a better one from WhatsApp
    if contact_name and contact_name != from_phone and contact.name in [from_phone, display_phone]:
        contact.name = contact_name

    # ── Find or create conversation ──
    conv = db.query(Conversation).filter(
        Conversation.contact_id == contact.id,
        Conversation.status != ConversationStatus.closed
    ).first()

    is_new_conversation = False
    if not conv:
        is_new_conversation = True
        conv = Conversation(
            contact_id=contact.id,
            owner_id=None,  # Unassigned — will appear in "לא הוקצתה" tab
            status=ConversationStatus.open,
            category=contact.category,
            phone_number_id=phone_number_id,  # Track which number received this
            is_new=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            last_message_at=datetime.utcnow()
        )
        db.add(conv)
        db.flush()
    else:
        # Update phone_number_id if not set
        if not conv.phone_number_id:
            conv.phone_number_id = phone_number_id

    # ── Build media URL if applicable ──
    media_url = None
    if msg_data.get("media_id"):
        # Store media_id — we'll download on demand
        media_url = f"wa-media://{msg_data['media_id']}"

    # ── Save message ──
    msg = Message(
        conversation_id=conv.id,
        content=msg_data["content"],
        message_type=message_type,
        media_url=media_url,
        direction=MessageDirection.inbound,
        sent_by=None,
        is_read=False,
        read_status=ReadStatus.read,  # Customer sees it as "read" (blue ticks)
        is_internal_note=False,
        wa_message_id=wa_message_id,
        created_at=datetime.utcnow()
    )
    db.add(msg)
    conv.last_message_at = datetime.utcnow()
    conv.updated_at = datetime.utcnow()

    # Reopen conversation if it was waiting
    if conv.status == ConversationStatus.waiting:
        conv.status = ConversationStatus.open

    db.commit()
    db.refresh(msg)

    # ── Send blue ticks to customer ──
    try:
        await mark_message_as_read(wa_message_id, phone_number_id)
    except Exception:
        pass  # Don't fail on read receipt errors

    # ── Notify agents via WebSocket ──
    notify_data = {
        "type": "new_message",
        "conversation_id": conv.id,
        "is_new_conversation": is_new_conversation,
        "message": {
            "id": msg.id,
            "conversation_id": conv.id,
            "content": msg_data["content"],
            "message_type": message_type.value,
            "media_url": media_url,
            "direction": "inbound",
            "sent_by": None,
            "sender_name": contact.name,
            "is_read": False,
            "read_status": "read",
            "is_internal_note": False,
            "deleted_at": None,
            "created_at": msg.created_at.isoformat()
        }
    }

    # Notify conversation owner + shared agents + all admins
    notify_users = set()
    if conv.owner_id:
        notify_users.add(conv.owner_id)
    if conv.shared_with:
        notify_users.update(conv.shared_with)

    # Always notify admins
    admins = db.query(User).filter(User.role == UserRole.admin).all()
    for a in admins:
        notify_users.add(a.id)

    await manager.send_to_users(list(notify_users), notify_data)

    print(f"📩 Incoming message from {display_phone}: {msg_data['content'][:50]}")


# ─── Handle Status Update ──────────────────────────────────────
async def _handle_status_update(event: dict, db: Session):
    """Process message status updates (sent, delivered, read)."""
    wa_message_id = event.get("message_id")
    status = event.get("status")

    if not wa_message_id or not status:
        return

    # Map WhatsApp status to our ReadStatus
    status_map = {
        "sent": ReadStatus.sent,
        "delivered": ReadStatus.delivered,
        "read": ReadStatus.read,
    }

    new_status = status_map.get(status)
    if not new_status:
        return

    # Find the message by WhatsApp message ID
    msg = db.query(Message).filter(Message.wa_message_id == wa_message_id).first()
    if not msg:
        return

    # Only update if status is "higher" (sent → delivered → read)
    status_order = {ReadStatus.sent: 1, ReadStatus.delivered: 2, ReadStatus.read: 3}
    if status_order.get(new_status, 0) > status_order.get(msg.read_status, 0):
        msg.read_status = new_status
        db.commit()

        # Notify via WebSocket
        await manager.broadcast({
            "type": "message_status",
            "conversation_id": msg.conversation_id,
            "message_id": msg.id,
            "wa_message_id": wa_message_id,
            "status": status
        })

    # Handle errors
    if event.get("errors"):
        error_msg = event["errors"][0].get("title", "Unknown error")
        print(f"⚠️ WhatsApp delivery error for {wa_message_id}: {error_msg}")


# ─── Media Proxy (download customer-sent files) ───────────────
@router.get("/whatsapp/media/{media_id}")
async def proxy_media(media_id: str, token: str = Query(None), current_user: User = Depends(get_current_user)):
    """Download media from WhatsApp CDN and proxy to frontend."""
    try:
        # Step 1: Get media URL from WhatsApp
        media_info = await download_media(media_id)
        media_url = media_info.get("url")
        mime_type = media_info.get("mime_type", "application/octet-stream")

        if not media_url:
            raise HTTPException(status_code=404, detail="Media not found")

        # Step 2: Download actual file bytes
        content = await get_media_bytes(media_url)

        # Map mime type to file extension
        ext_map = {
            "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
            "video/mp4": ".mp4", "audio/ogg": ".ogg", "audio/mpeg": ".mp3",
            "application/pdf": ".pdf", "audio/aac": ".aac",
        }
        ext = ext_map.get(mime_type, "")
        filename = f"whatsapp_{media_id[:10]}{ext}"

        return StarletteResponse(
            content=content,
            media_type=mime_type,
            headers={"Content-Disposition": f"inline; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download media: {str(e)}")
