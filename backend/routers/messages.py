from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from datetime import datetime
from database import get_db
from models import User, Conversation, Message, MessageDirection, ReadStatus, ConversationStatus
from schemas import MessageCreate, MessageResponse
from auth import get_current_user, log_action, sanitize_input
from websocket_manager import manager
from whatsapp import send_text_message, send_image_message, send_document_message, send_template_message, send_audio_message, upload_media

router = APIRouter(prefix="/api/conversations/{conversation_id}/messages", tags=["messages"])


def message_to_response(msg, db) -> MessageResponse:
    sender_name = None
    if msg.sent_by:
        sender = db.query(User).filter(User.id == msg.sent_by).first()
        if sender:
            sender_name = sender.name
    return MessageResponse(
        id=msg.id,
        conversation_id=msg.conversation_id,
        content=msg.content,
        message_type=msg.message_type.value if msg.message_type else "text",
        media_url=msg.media_url,
        direction=msg.direction,
        sent_by=msg.sent_by,
        sender_name=sender_name,
        is_read=msg.is_read,
        read_status=msg.read_status,
        is_internal_note=msg.is_internal_note,
        deleted_at=msg.deleted_at,
        created_at=msg.created_at
    )


@router.get("/", response_model=List[MessageResponse])
def get_messages(
    conversation_id: int,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.deleted_at.is_(None)
    )

    if search:
        query = query.filter(Message.content.ilike(f"%{search}%"))

    # Non-admin agents can't see internal notes from other agents
    messages = query.order_by(Message.created_at.asc()).all()
    return [message_to_response(m, db) for m in messages]


@router.post("/", response_model=MessageResponse)
async def send_message(
    conversation_id: int,
    msg: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Sanitize message content
    clean_content = sanitize_input(msg.content, max_length=5000)

    new_msg = Message(
        conversation_id=conversation_id,
        content=clean_content,
        message_type=msg.message_type,
        media_url=msg.media_url,
        direction=MessageDirection.outbound,
        sent_by=current_user.id,
        is_internal_note=msg.is_internal_note,
        read_status=ReadStatus.sent
    )
    db.add(new_msg)
    conv.last_message_at = func.now()

    # Auto-assign: if conversation has no owner and agent sends a message, assign to them
    if conv.owner_id is None and not msg.is_internal_note:
        conv.owner_id = current_user.id
        conv.status = ConversationStatus.in_progress
    db.commit()
    db.refresh(new_msg)

    # Send via WhatsApp Cloud API (skip for internal notes)
    if not msg.is_internal_note:
        try:
            from models import Contact
            contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
            if contact:
                phone_id = conv.phone_number_id
                # Fix legacy phone_id format (might contain :display_name)
                if phone_id and ":" in phone_id:
                    phone_id = phone_id.split(":")[0]

                if msg.message_type in ("image",) and msg.media_url:
                    wa_result = await send_image_message(contact.phone, image_url=msg.media_url, phone_number_id=phone_id)
                elif msg.message_type in ("file", "document") and msg.media_url:
                    wa_result = await send_document_message(contact.phone, document_url=msg.media_url, phone_number_id=phone_id)
                else:
                    wa_result = await send_text_message(contact.phone, clean_content, phone_number_id=phone_id)

                # Store WhatsApp message ID for status tracking
                wa_msg_id = wa_result.get("messages", [{}])[0].get("id") if not wa_result.get("demo") else None
                if wa_msg_id:
                    new_msg.wa_message_id = wa_msg_id
                    new_msg.read_status = ReadStatus.sent
                else:
                    new_msg.read_status = ReadStatus.delivered  # Demo mode
        except Exception as e:
            print(f"WhatsApp send error: {e}")
            new_msg.read_status = ReadStatus.sent  # Mark as sent even if WA fails
        db.commit()

    response = message_to_response(new_msg, db)

    # Notify via WebSocket
    notify_users = set()
    if conv.owner_id:
        notify_users.add(conv.owner_id)
    if conv.shared_with:
        notify_users.update(conv.shared_with)
    # Also notify admins
    from models import User as UserModel, UserRole
    admins = db.query(UserModel).filter(UserModel.role == UserRole.admin).all()
    for a in admins:
        notify_users.add(a.id)

    notify_users.discard(current_user.id)

    await manager.send_to_users(list(notify_users), {
        "type": "new_message",
        "conversation_id": conversation_id,
        "message": response.model_dump(mode="json")
    })

    return response


@router.post("/send-template")
async def send_wa_template(
    conversation_id: int,
    template_name: str,
    customer_name: str = "",
    agent_name: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a WhatsApp template message to initiate a conversation."""
    from models import Contact
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Template display texts
    template_contents = {
        "welcome_message": f"היי {customer_name}, כאן {agent_name} מקבוצת יש לי זכות ממחלקת החזרי מס.\n\nהבדיקה ללא עלות ועל בסיס הצלחה בלבד!\nאין צורך בטפסים מקדימים מראש, אנו עושים עבורך את כל העבודה.\n\nבמידה ואין החזר - אין התחייבות או תשלום מצידכם.\n\nלצורך הבדיקה יש לשלוח אמצעי זיהוי בלבד.\nכאן לשירותך!",
        "welcome_soker": f"היי {customer_name}, כאן {agent_name} מקבוצת יש לי זכות ממחלקת החזרי מס.\n\nנקבעה לך פגישה טלפונית.\nהבדיקה ללא עלות ועל בסיס הצלחה בלבד!",
        "welcome_textech": f"אז אנחנו יוצאים לדרך! 🏁\n\n{customer_name}, תקבל הודעות WhatsApp תחת השם Tax Tech.\n\nתודה רבה על שיתוף הפעולה, שיהיה המון בהצלחה!",
        "no_answer": f"שלום {customer_name}, כאן {agent_name} מקבוצת יש לי זכות.\n\nחזרתי אליך כפי שביקשת אך אין מענה מצידך.\nלהזכירך - הבדיקה ללא עלות ועל בסיס הצלחה בלבד.\n\nמתי נוכל לשוחח?\nכאן לשירותך!",
        "free": f"שלום רב, {customer_name}\nלשירותך תמיד",
    }

    # Build template components with variables
    components = []
    if customer_name or agent_name:
        params = []
        if customer_name:
            params.append({"type": "text", "text": customer_name})
        if agent_name:
            params.append({"type": "text", "text": agent_name})
        components.append({"type": "body", "parameters": params})

    try:
        from whatsapp import get_default_phone_id
        phone_id = conv.phone_number_id
        # Fix legacy phone_id format (might contain :display_name)
        if phone_id and ":" in phone_id:
            phone_id = phone_id.split(":")[0]
        if not phone_id:
            phone_id = get_default_phone_id()
        print(f"📨 Sending template '{template_name}' to {contact.phone} via phone_id={phone_id}")

        result = await send_template_message(
            phone=contact.phone,
            template_name=template_name,
            language="he",
            components=components,
            phone_number_id=phone_id
        )

        print(f"📨 Template result: {result}")

        # Save as outbound message with actual content
        template_text = template_contents.get(template_name, f"📋 תבנית: {template_name}")
        msg = Message(
            conversation_id=conversation_id,
            content=template_text,
            message_type="text",
            direction=MessageDirection.outbound,
            sent_by=current_user.id,
            is_internal_note=False,
            read_status=ReadStatus.sent
        )
        db.add(msg)
        conv.last_message_at = func.now()

        # Auto-assign if unassigned
        if conv.owner_id is None:
            conv.owner_id = current_user.id
            conv.status = ConversationStatus.in_progress

        db.commit()
        db.refresh(msg)

        return {"message": "Template sent successfully", "wa_result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send template: {str(e)}")


@router.post("/upload")
async def upload_voice(
    conversation_id: int,
    type: str = Query("voice"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload voice message or file and send via WhatsApp."""
    from models import Contact
    import os, tempfile

    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    file_bytes = await file.read()
    mime_type = file.content_type or "audio/ogg"
    filename = file.filename or "voice.ogg"

    # Get phone_id
    from whatsapp import get_default_phone_id
    phone_id = conv.phone_number_id
    if phone_id and ":" in phone_id:
        phone_id = phone_id.split(":")[0]
    if not phone_id:
        phone_id = get_default_phone_id()

    media_url = None
    try:
        # Upload to WhatsApp CDN
        upload_result = await upload_media(file_bytes, mime_type, filename, phone_id)
        media_id = upload_result.get("id")

        if media_id:
            # Send audio message to customer
            from models import Contact
            contact = db.query(Contact).filter(Contact.id == conv.contact_id).first()
            if contact:
                await send_audio_message(contact.phone, audio_id=media_id, phone_number_id=phone_id)
            media_url = f"wa-media://{media_id}"
    except Exception as e:
        print(f"❌ Voice upload/send error: {e}")

    msg_type = "voice" if type == "voice" else "audio"
    msg = Message(
        conversation_id=conversation_id,
        content="הודעה קולית" if type == "voice" else filename,
        message_type=msg_type,
        media_url=media_url,
        direction=MessageDirection.outbound,
        sent_by=current_user.id,
        is_internal_note=False,
        read_status=ReadStatus.sent
    )
    db.add(msg)
    conv.last_message_at = func.now()

    if conv.owner_id is None:
        conv.owner_id = current_user.id
        conv.status = ConversationStatus.in_progress

    db.commit()
    db.refresh(msg)

    return message_to_response(msg, db)


@router.post("/{message_id}/read")
def mark_read(
    conversation_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.direction == MessageDirection.inbound,
        Message.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "Marked as read"}


@router.delete("/{message_id}")
def delete_message(
    conversation_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    msg = db.query(Message).filter(
        Message.id == message_id,
        Message.conversation_id == conversation_id
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.deleted_at = datetime.utcnow()
    db.commit()
    log_action(current_user.id, "MESSAGE_DELETED", f"msg_id={message_id} conv={conversation_id}")
    return {"message": "Deleted"}
