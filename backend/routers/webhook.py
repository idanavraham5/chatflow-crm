"""
WhatsApp Cloud API Webhook — receives incoming messages and status updates from Meta.
"""
import os
import hmac
import hashlib
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from database import get_db, DATABASE_URL
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

# App Secret for webhook signature verification
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")


def verify_webhook_signature(payload: bytes, signature_header: str) -> bool:
    """Verify that the webhook payload was sent by Meta using HMAC-SHA256."""
    if not WHATSAPP_APP_SECRET:
        # If no app secret configured, log warning but allow (for dev/migration)
        print("⚠️ WHATSAPP_APP_SECRET not set — skipping signature verification")
        return True
    if not signature_header:
        return False
    # Header format: "sha256=<hex_signature>"
    if not signature_header.startswith("sha256="):
        return False
    expected_sig = signature_header[7:]
    computed_sig = hmac.new(
        WHATSAPP_APP_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed_sig, expected_sig)


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
    # Verify Meta signature
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    if not verify_webhook_signature(raw_body, signature):
        print("❌ Webhook signature verification failed!")
        raise HTTPException(status_code=403, detail="Invalid signature")

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
    context_message_id = event.get("context_message_id")  # For button replies — links to original template

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
    normalized = normalize_phone(from_phone)
    # Build ALL possible formats the contact might be stored as
    local_no_dash = ("0" + normalized[3:]) if normalized.startswith("972") else normalized
    # Extract just the digits for flexible matching
    raw_digits = normalized  # e.g. 972544499787
    last_7 = raw_digits[-7:] if len(raw_digits) >= 7 else raw_digits
    last_9 = raw_digits[-9:] if len(raw_digits) >= 9 else raw_digits

    # Method 1: Exact match on all known formats
    print(f"🔍 Looking for contact: from={from_phone}, display={display_phone}, normalized={normalized}, local={local_no_dash}")
    contact = db.query(Contact).filter(
        Contact.phone.in_([
            display_phone,           # 054-449-9787
            normalized,              # 972544499787
            f"+{normalized}",        # +972544499787
            from_phone,              # raw from WhatsApp
            local_no_dash,           # 0544499787
        ])
    ).first()

    # Method 2: Strip all non-digits from stored phone and compare last 9 digits
    # This catches ANY format mismatch (dashes, spaces, +, etc.)
    if not contact:
        import re
        all_contacts = db.query(Contact).filter(~Contact.phone.startswith("merged_")).all()
        for c in all_contacts:
            stored_digits = re.sub(r'[^0-9]', '', c.phone)
            if stored_digits.startswith("0"):
                stored_digits = "972" + stored_digits[1:]
            elif not stored_digits.startswith("972"):
                stored_digits = "972" + stored_digits
            # Compare normalized digits
            if stored_digits == raw_digits:
                contact = c
                print(f"✅ Found contact via digit normalization: id={c.id}, phone={c.phone}")
                break
            # Fallback: last 9 digits match (handles edge cases)
            if len(stored_digits) >= 9 and len(raw_digits) >= 9 and stored_digits[-9:] == last_9:
                contact = c
                print(f"✅ Found contact via last-9-digits match: id={c.id}, phone={c.phone}")
                break

    if contact:
        print(f"✅ Found existing contact: id={contact.id}, name={contact.name}, phone={contact.phone}")
        # Normalize the stored phone to display format if it's not already
        if contact.phone != display_phone and not contact.phone.startswith("merged_"):
            print(f"  📞 Normalizing stored phone: '{contact.phone}' → '{display_phone}'")
            contact.phone = display_phone
    else:
        print(f"🆕 Creating new contact for {display_phone}")

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
    conv = None

    # If this is a button/reply to a specific message (e.g. template button click),
    # find the conversation that contains the original message
    if context_message_id:
        original_msg = db.query(Message).filter(Message.wa_message_id == context_message_id).first()
        if original_msg:
            conv = db.query(Conversation).filter(Conversation.id == original_msg.conversation_id).first()
            print(f"🔗 Button reply linked to conversation {conv.id} via context message {context_message_id}")
            # Reopen if closed — customer responded to our template
            if conv and conv.status == ConversationStatus.closed:
                conv.status = ConversationStatus.open
                print(f"🔓 Reopened closed conversation {conv.id} due to button reply")

    # Fallback: find any non-closed conversation for this contact (prefer most recent)
    if not conv:
        conv = db.query(Conversation).filter(
            Conversation.contact_id == contact.id,
            Conversation.status != ConversationStatus.closed
        ).order_by(Conversation.last_message_at.desc()).first()

    # Last resort: find the most recent closed conversation and reopen it
    # (better than creating a new one — keeps conversation history together)
    if not conv:
        conv = db.query(Conversation).filter(
            Conversation.contact_id == contact.id,
            Conversation.status == ConversationStatus.closed
        ).order_by(Conversation.last_message_at.desc()).first()
        if conv:
            conv.status = ConversationStatus.open
            print(f"🔓 Reopened most recent closed conversation {conv.id} for contact {contact.id}")

    is_new_conversation = False
    if not conv:
        # Lock to prevent race condition — two messages creating duplicate conversations
        if "postgresql" in DATABASE_URL:
            db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": contact.id})

        # Re-check after lock — look for ANY conversation (including closed)
        conv = db.query(Conversation).filter(
            Conversation.contact_id == contact.id,
            Conversation.status != ConversationStatus.closed
        ).order_by(Conversation.last_message_at.desc()).first()

        if not conv:
            # Try reopening a closed one
            conv = db.query(Conversation).filter(
                Conversation.contact_id == contact.id,
                Conversation.status == ConversationStatus.closed
            ).order_by(Conversation.last_message_at.desc()).first()
            if conv:
                conv.status = ConversationStatus.open
                print(f"🔓 Reopened closed conversation {conv.id} after lock")

        if not conv:
            is_new_conversation = True
            conv = Conversation(
                contact_id=contact.id,
                owner_id=None,
                status=ConversationStatus.open,
                category=contact.category,
                phone_number_id=phone_number_id,
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

    # Notify conversation owner + shared agents + admins only
    notify_users = set()
    if conv.owner_id:
        notify_users.add(conv.owner_id)
    if conv.shared_with:
        notify_users.update(conv.shared_with)

    # Always notify admins
    admins = db.query(User).filter(User.role == UserRole.admin).all()
    for a in admins:
        notify_users.add(a.id)

    if notify_users:
        await manager.send_to_users(list(notify_users), notify_data)

    print(f"📩 Incoming message from {display_phone}: {msg_data['content'][:50]}")


# ─── Handle Status Update ──────────────────────────────────────
async def _handle_status_update(event: dict, db: Session):
    """Process message status updates (sent, delivered, read)."""
    wa_message_id = event.get("message_id")
    status = event.get("status")

    print(f"📊 Status update: wa_id={wa_message_id}, status={status}")

    if not wa_message_id or not status:
        return

    # Handle errors FIRST (before early return for unknown statuses)
    if event.get("errors"):
        error_details = event["errors"]
        for err in error_details:
            print(f"⚠️ WhatsApp delivery error for {wa_message_id}: code={err.get('code')}, title={err.get('title')}, message={err.get('message')}, error_data={err.get('error_data')}")

    if status == "failed":
        print(f"❌ Message FAILED: wa_id={wa_message_id}, errors={event.get('errors')}")
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
        print(f"📊 Message not found for wa_id={wa_message_id}")
        return
    print(f"📊 Found message {msg.id}, current status={msg.read_status}, new status={new_status}")

    # Only update if status is "higher" (sent → delivered → read)
    status_order = {ReadStatus.sent: 1, ReadStatus.delivered: 2, ReadStatus.read: 3}
    if status_order.get(new_status, 0) > status_order.get(msg.read_status, 0):
        msg.read_status = new_status
        db.commit()

        # Notify only relevant users via WebSocket
        conv = db.query(Conversation).filter(Conversation.id == msg.conversation_id).first()
        notify_users = set()
        if conv:
            if conv.owner_id:
                notify_users.add(conv.owner_id)
            if conv.shared_with:
                notify_users.update(conv.shared_with)
        # Always notify admins
        admins = db.query(User).filter(User.role == UserRole.admin).all()
        for a in admins:
            notify_users.add(a.id)
        if notify_users:
            await manager.send_to_users(list(notify_users), {
                "type": "message_status",
                "conversation_id": msg.conversation_id,
                "message_id": msg.id,
                "wa_message_id": wa_message_id,
                "status": status
            })


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
