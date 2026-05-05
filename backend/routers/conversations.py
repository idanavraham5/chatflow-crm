from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, text as sql_text
from typing import Optional, List
from datetime import datetime
from database import get_db, DATABASE_URL
from models import User, Conversation, Message, Contact, ConversationStatus, CategoryType, PriorityLevel, UserRole
from whatsapp import get_default_phone_id, format_phone_display, normalize_phone
from schemas import ConversationResponse, ConversationCreate, ConversationUpdate, TransferRequest, ShareRequest
from auth import get_current_user, log_action, sanitize_search
from websocket_manager import manager

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def build_conversation_response(conv, db, prefetched=None):
    """Build response for a single conversation.
    If prefetched dict is provided, use it instead of querying (batch optimization).
    """
    if prefetched:
        last_msg_content = prefetched.get("last_messages", {}).get(conv.id)
        unread = prefetched.get("unread_counts", {}).get(conv.id, 0)
    else:
        last_msg = db.query(Message).filter(
            Message.conversation_id == conv.id,
            Message.deleted_at.is_(None),
            Message.is_internal_note == False
        ).order_by(Message.created_at.desc()).first()
        last_msg_content = last_msg.content if last_msg else None

        unread = db.query(func.count(Message.id)).filter(
            Message.conversation_id == conv.id,
            Message.is_read == False,
            Message.direction == "inbound",
            Message.deleted_at.is_(None),
            Message.is_internal_note == False
        ).scalar()

    owner_name = None
    if conv.owner:
        owner_name = conv.owner.name

    return ConversationResponse(
        id=conv.id,
        contact_id=conv.contact_id,
        contact=conv.contact,
        owner_id=conv.owner_id,
        owner_name=owner_name,
        shared_with=conv.shared_with or [],
        status=conv.status,
        category=conv.category,
        priority=conv.priority or "normal",
        labels=conv.labels or [],
        is_new=conv.is_new if conv.is_new is not None else False,
        phone_number_id=conv.phone_number_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        last_message_at=conv.last_message_at,
        last_message=last_msg_content,
        unread_count=unread
    )


@router.get("/", response_model=List[ConversationResponse])
def list_conversations(
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    tab: Optional[str] = None,
    label_id: Optional[int] = None,
    priority: Optional[str] = None,
    show_closed: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Conversation).options(
        joinedload(Conversation.contact),
        joinedload(Conversation.owner)
    )

    if status:
        query = query.filter(Conversation.status == status)
    elif not show_closed:
        query = query.filter(Conversation.status != ConversationStatus.closed)

    if category:
        query = query.filter(Conversation.category == category)

    if priority:
        query = query.filter(Conversation.priority == priority)

    if search:
        query = query.join(Contact).filter(
            or_(
                Contact.name.ilike(f"%{search}%"),
                Contact.phone.ilike(f"%{search}%")
            )
        )

    # Tab filtering in SQL for reliability
    if tab == "mine":
        query = query.filter(Conversation.owner_id == current_user.id)
    elif tab == "unassigned":
        # Only admin can see unassigned conversations
        if current_user.role.value != "admin":
            return []
        query = query.filter(Conversation.owner_id.is_(None))
    elif tab == "new":
        query = query.filter(Conversation.is_new == True)

    convs = query.order_by(Conversation.last_message_at.desc()).all()

    # Non-admin users: ALWAYS filter to only their own + shared conversations
    if current_user.role.value != "admin" and tab not in ("unassigned",):
        convs = [c for c in convs if c.owner_id == current_user.id or current_user.id in (c.shared_with or [])]

    if label_id is not None:
        convs = [c for c in convs if label_id in (c.labels or [])]

    if not convs:
        return []

    # Batch fetch: unread counts and last messages in 2 queries instead of N*2
    conv_ids = [c.id for c in convs]

    # Batch unread counts
    unread_rows = db.query(
        Message.conversation_id,
        func.count(Message.id)
    ).filter(
        Message.conversation_id.in_(conv_ids),
        Message.is_read == False,
        Message.direction == "inbound",
        Message.deleted_at.is_(None),
        Message.is_internal_note == False
    ).group_by(Message.conversation_id).all()
    unread_counts = {row[0]: row[1] for row in unread_rows}

    # Batch last messages — get the latest non-deleted, non-internal message per conversation
    last_messages = {}
    if "postgresql" in DATABASE_URL:
        # PostgreSQL: efficient DISTINCT ON
        rows = db.execute(sql_text("""
            SELECT DISTINCT ON (conversation_id) conversation_id, content
            FROM messages
            WHERE conversation_id = ANY(:ids)
              AND deleted_at IS NULL
              AND is_internal_note = false
            ORDER BY conversation_id, created_at DESC
        """), {"ids": conv_ids}).fetchall()
        last_messages = {row[0]: row[1] for row in rows}
    else:
        # SQLite fallback: use subquery
        for conv in convs:
            msg = db.query(Message.content).filter(
                Message.conversation_id == conv.id,
                Message.deleted_at.is_(None),
                Message.is_internal_note == False
            ).order_by(Message.created_at.desc()).first()
            last_messages[conv.id] = msg[0] if msg else None

    prefetched = {
        "unread_counts": unread_counts,
        "last_messages": last_messages
    }

    return [build_conversation_response(c, db, prefetched=prefetched) for c in convs]


@router.get("/counts")
def conversation_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get conversation counts for each tab."""
    base = db.query(Conversation).filter(Conversation.status != ConversationStatus.closed).all()

    mine = len([c for c in base if c.owner_id == current_user.id])
    unassigned = len([c for c in base if c.owner_id is None]) if current_user.role.value == "admin" else 0
    new_count = len([c for c in base if c.is_new])

    # Admin sees total, agent sees only their own + shared
    if current_user.role.value == "admin":
        total = len(base)
    else:
        total = len([c for c in base if c.owner_id == current_user.id or current_user.id in (c.shared_with or [])])

    return {
        "mine": mine,
        "unassigned": unassigned,
        "all": total,
        "new": new_count
    }


@router.post("/", response_model=ConversationResponse)
def create_conversation_endpoint(
    data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new conversation. Either provide contact_id or phone+name to create new contact."""
    contact_id = data.contact_id
    phone = data.phone
    name = data.name
    category = data.category or "service"

    if contact_id:
        contact = db.query(Contact).filter(Contact.id == contact_id).first()
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
    elif phone:
        # Normalize phone to consistent display format (054-449-9787)
        normalized = normalize_phone(phone)
        display_phone = format_phone_display(normalized)
        local_no_dash = ("0" + normalized[3:]) if normalized.startswith("972") else normalized

        # Find existing contact by any phone format
        contact = db.query(Contact).filter(
            Contact.phone.in_([phone, display_phone, normalized, f"+{normalized}", local_no_dash])
        ).first()

        if not contact:
            contact = Contact(
                name=name or display_phone,
                phone=display_phone,  # Always store in consistent format
                category=category
            )
            db.add(contact)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="Provide contact_id or phone number")

    # Check if there's already an open conversation with this contact
    existing = db.query(Conversation).filter(
        Conversation.contact_id == contact.id,
        Conversation.status != ConversationStatus.closed
    ).first()
    if existing:
        # Return existing conversation
        return build_conversation_response(existing, db)

    conv = Conversation(
        contact_id=contact.id,
        owner_id=current_user.id,
        status=ConversationStatus.open,
        category=contact.category,
        phone_number_id=data.phone_number_id or get_default_phone_id(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        last_message_at=datetime.utcnow()
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    # Reload with relationships
    conv = db.query(Conversation).options(
        joinedload(Conversation.contact),
        joinedload(Conversation.owner)
    ).filter(Conversation.id == conv.id).first()

    return build_conversation_response(conv, db)


@router.get("/{conversation_id}", response_model=ConversationResponse)
def get_conversation(conversation_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).options(
        joinedload(Conversation.contact),
        joinedload(Conversation.owner)
    ).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check access
    if current_user.role.value != "admin":
        if conv.owner_id != current_user.id and current_user.id not in (conv.shared_with or []):
            raise HTTPException(status_code=403, detail="Access denied")

    return build_conversation_response(conv, db)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
def update_conversation(
    conversation_id: int,
    update: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conv = db.query(Conversation).options(
        joinedload(Conversation.contact),
        joinedload(Conversation.owner)
    ).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if update.status:
        conv.status = update.status
    if update.category:
        conv.category = update.category
    if update.owner_id is not None:
        conv.owner_id = update.owner_id
    if update.priority is not None:
        conv.priority = update.priority
    if update.labels is not None:
        conv.labels = update.labels
    if update.is_new is not None:
        conv.is_new = update.is_new

    db.commit()
    db.refresh(conv)
    return build_conversation_response(conv, db)


@router.post("/{conversation_id}/transfer")
async def transfer_conversation(
    conversation_id: int,
    req: TransferRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # All agents can transfer — small team workflow (soker ↔ agent ↔ manager)
    old_owner = conv.owner_id
    conv.owner_id = req.agent_id
    conv.status = ConversationStatus.in_progress
    db.commit()

    log_action(current_user.id, "CONV_TRANSFER", f"conv={conversation_id} from={old_owner} to={req.agent_id}")

    await manager.send_personal(req.agent_id, {
        "type": "conversation_transferred",
        "conversation_id": conversation_id,
        "from_agent": current_user.name
    })

    return {"message": "Transferred successfully"}


@router.post("/{conversation_id}/share")
async def share_conversation(
    conversation_id: int,
    req: ShareRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # All agents can share — small team workflow
    # Use set to prevent duplicates
    shared = list(set((conv.shared_with or []) + [req.agent_id]))
    conv.shared_with = shared
    db.commit()

    log_action(current_user.id, "CONV_SHARED", f"conv={conversation_id} shared_with={req.agent_id}")

    await manager.send_personal(req.agent_id, {
        "type": "conversation_shared",
        "conversation_id": conversation_id,
        "from_agent": current_user.name
    })

    return {"message": "Shared successfully"}
