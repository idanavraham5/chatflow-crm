"""
Migration: Normalize all phone numbers and merge duplicate contacts/conversations.

This script:
1. Normalizes ALL contact phone numbers to display format (054-449-9787)
2. Finds contacts with the same normalized phone — merges conversations to the oldest contact
3. Finds multiple open conversations for the same contact — merges messages to the oldest conversation
4. NEVER deletes anything — only moves messages/conversations and soft-marks duplicates

Safe to run multiple times (idempotent).
"""
import re
from datetime import datetime
from sqlalchemy.orm import Session
from models import Contact, Conversation, Message, ConversationStatus


def normalize_phone(phone: str) -> str:
    """Normalize Israeli phone number to international format (972...)."""
    phone = phone.replace("-", "").replace(" ", "").replace("+", "").replace("(", "").replace(")", "")
    if phone.startswith("0"):
        phone = "972" + phone[1:]
    elif not phone.startswith("972"):
        phone = "972" + phone
    return phone


def format_phone_display(phone: str) -> str:
    """Format phone for display (e.g. 972501234567 → 050-123-4567)."""
    phone = phone.replace("+", "").replace("-", "").replace(" ", "")
    if phone.startswith("972"):
        local = "0" + phone[3:]
        if len(local) == 10:
            return f"{local[:3]}-{local[3:6]}-{local[6:]}"
        return local
    return phone


def get_normalized_key(phone: str) -> str:
    """Get a consistent key for grouping — the raw digits in 972XXXXXXXXX format."""
    cleaned = re.sub(r'[^0-9]', '', phone)
    if cleaned.startswith("0"):
        cleaned = "972" + cleaned[1:]
    elif not cleaned.startswith("972"):
        cleaned = "972" + cleaned
    return cleaned


def run_migration(db: Session):
    """Main migration: normalize phones, merge duplicate contacts & conversations."""
    print("=" * 60)
    print("🔄 Starting phone normalization & duplicate merge migration")
    print("=" * 60)

    all_contacts = db.query(Contact).all()
    print(f"📊 Total contacts in database: {len(all_contacts)}")

    # ── Step 1: Group contacts by normalized phone ──
    phone_groups = {}  # normalized_key → [contact, contact, ...]
    for contact in all_contacts:
        key = get_normalized_key(contact.phone)
        if key not in phone_groups:
            phone_groups[key] = []
        phone_groups[key].append(contact)

    duplicates_found = {k: v for k, v in phone_groups.items() if len(v) > 1}
    print(f"🔍 Found {len(duplicates_found)} phone numbers with duplicate contacts")

    merged_contacts = 0
    merged_conversations = 0
    moved_messages = 0

    # ── Step 2: Merge duplicate contacts ──
    for norm_phone, contacts in duplicates_found.items():
        # Keep the oldest contact (lowest id) as primary
        contacts.sort(key=lambda c: c.id)
        primary = contacts[0]
        duplicates = contacts[1:]

        display = format_phone_display(norm_phone)
        print(f"\n  📱 Phone {display}: primary=Contact#{primary.id} ({primary.name}), "
              f"duplicates={[f'#{c.id} ({c.name})' for c in duplicates]}")

        for dup in duplicates:
            # Move all conversations from duplicate contact to primary
            dup_convs = db.query(Conversation).filter(Conversation.contact_id == dup.id).all()
            for conv in dup_convs:
                print(f"    ↪ Moving Conversation#{conv.id} from Contact#{dup.id} → Contact#{primary.id}")
                conv.contact_id = primary.id
                merged_conversations += 1

            # Keep the duplicate contact but update its name to indicate it's merged
            # We can't delete because of the unique constraint — instead rename phone to mark it
            dup.phone = f"merged_{dup.id}_{dup.phone}"
            dup.name = f"[ממוזג→#{primary.id}] {dup.name}"
            merged_contacts += 1

    db.flush()
    print(f"\n✅ Merged {merged_contacts} duplicate contacts")

    # ── Step 3: Normalize ALL contact phones to display format ──
    normalized_count = 0
    remaining_contacts = db.query(Contact).filter(~Contact.phone.startswith("merged_")).all()
    for contact in remaining_contacts:
        norm = normalize_phone(contact.phone)
        display = format_phone_display(norm)
        if contact.phone != display:
            print(f"  📞 Normalizing Contact#{contact.id}: '{contact.phone}' → '{display}'")
            contact.phone = display
            normalized_count += 1

    db.flush()
    print(f"✅ Normalized {normalized_count} phone numbers to display format")

    # ── Step 4: Merge duplicate conversations for same contact ──
    # Find contacts with multiple non-closed conversations
    all_active_contacts = db.query(Conversation.contact_id).filter(
        Conversation.status != ConversationStatus.closed,
        ~Contact.phone.startswith("merged_")
    ).join(Contact).group_by(Conversation.contact_id).all()

    for (contact_id,) in all_active_contacts:
        open_convs = db.query(Conversation).filter(
            Conversation.contact_id == contact_id,
            Conversation.status != ConversationStatus.closed
        ).order_by(Conversation.created_at.asc()).all()

        if len(open_convs) <= 1:
            continue

        # Keep the oldest conversation (or the one with an owner) as primary
        # Prefer conversation with an owner assigned
        primary_conv = None
        for c in open_convs:
            if c.owner_id:
                primary_conv = c
                break
        if not primary_conv:
            primary_conv = open_convs[0]

        dup_convs = [c for c in open_convs if c.id != primary_conv.id]

        contact = db.query(Contact).filter(Contact.id == contact_id).first()
        print(f"\n  💬 Contact#{contact_id} ({contact.name if contact else '?'}): "
              f"primary=Conv#{primary_conv.id}, merging {len(dup_convs)} duplicate convs")

        for dup_conv in dup_convs:
            # Move all messages from duplicate conversation to primary
            msgs = db.query(Message).filter(Message.conversation_id == dup_conv.id).all()
            for msg in msgs:
                msg.conversation_id = primary_conv.id
                moved_messages += 1

            print(f"    ↪ Moved {len(msgs)} messages from Conv#{dup_conv.id} → Conv#{primary_conv.id}")

            # Merge shared_with lists
            if dup_conv.shared_with:
                existing_shared = set(primary_conv.shared_with or [])
                existing_shared.update(dup_conv.shared_with)
                primary_conv.shared_with = list(existing_shared)

            # If the duplicate had an owner and primary doesn't, take it
            if dup_conv.owner_id and not primary_conv.owner_id:
                primary_conv.owner_id = dup_conv.owner_id

            # Close the duplicate conversation (NOT delete)
            dup_conv.status = ConversationStatus.closed
            merged_conversations += 1

        # Update primary conversation timestamps
        latest_msg = db.query(Message).filter(
            Message.conversation_id == primary_conv.id
        ).order_by(Message.created_at.desc()).first()

        if latest_msg:
            primary_conv.last_message_at = latest_msg.created_at
            primary_conv.updated_at = datetime.utcnow()

    db.commit()

    print(f"\n{'=' * 60}")
    print(f"✅ Migration complete!")
    print(f"   • Duplicate contacts merged: {merged_contacts}")
    print(f"   • Phone numbers normalized: {normalized_count}")
    print(f"   • Conversations merged: {merged_conversations}")
    print(f"   • Messages moved: {moved_messages}")
    print(f"{'=' * 60}")
