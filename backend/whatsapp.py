"""
WhatsApp Cloud API Service Layer
Supports multiple phone numbers (multi-number setup).
"""
import os
import json
import httpx
from typing import Optional, Dict, Any
from datetime import datetime

# ─── Configuration ──────────────────────────────────────────────
WHATSAPP_API_URL = "https://graph.facebook.com/v21.0"
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "chatflow_verify_2024")

# Multi-number support: map phone_number_id → display info
# Populated on startup from env or database
PHONE_NUMBERS: Dict[str, dict] = {}


def init_phone_numbers():
    """Initialize phone numbers from environment variables.

    Expected format:
    WHATSAPP_PHONE_IDS=phone_id_1,phone_id_2
    WHATSAPP_PHONE_NAME_phone_id_1=יש לי זכות - מספר 1
    WHATSAPP_PHONE_NAME_phone_id_2=יש לי זכות - מספר 2
    """
    global PHONE_NUMBERS
    phone_ids_raw = os.getenv("WHATSAPP_PHONE_IDS", "").split(",")
    for entry in phone_ids_raw:
        entry = entry.strip()
        if not entry:
            continue
        # Support format: phone_id:display_name or just phone_id
        if ":" in entry:
            pid, display = entry.split(":", 1)
            pid = pid.strip()
            display = display.strip()
        else:
            pid = entry
            display = None
        if pid:
            name = display or os.getenv(f"WHATSAPP_PHONE_NAME_{pid}", f"מספר {pid}")
            PHONE_NUMBERS[pid] = {"name": name, "phone_number_id": pid}

    # Fallback: single number setup
    if not PHONE_NUMBERS:
        single_id = os.getenv("WHATSAPP_PHONE_ID", "")
        if single_id:
            PHONE_NUMBERS[single_id] = {
                "name": os.getenv("WHATSAPP_PHONE_NAME", "יש לי זכות"),
                "phone_number_id": single_id
            }


def get_default_phone_id() -> Optional[str]:
    """Get the first (default) phone number ID."""
    if PHONE_NUMBERS:
        return list(PHONE_NUMBERS.keys())[0]
    return None


def get_phone_numbers() -> Dict[str, dict]:
    """Get all configured phone numbers."""
    return PHONE_NUMBERS


# ─── Send Messages ──────────────────────────────────────────────

async def send_text_message(phone: str, text: str, phone_number_id: Optional[str] = None) -> dict:
    """Send a text message via WhatsApp Cloud API."""
    phone_id = phone_number_id or get_default_phone_id()
    if not phone_id:
        raise ValueError("No WhatsApp phone number configured")

    # Normalize phone number (remove dashes, spaces, leading 0)
    clean_phone = normalize_phone(phone)

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "text",
        "text": {"body": text}
    }

    return await _send_request(phone_id, payload)


async def send_template_message(
    phone: str,
    template_name: str,
    language: str = "he",
    components: list = None,
    phone_number_id: Optional[str] = None
) -> dict:
    """Send a template message (required for initiating conversations)."""
    phone_id = phone_number_id or get_default_phone_id()
    if not phone_id:
        raise ValueError("No WhatsApp phone number configured")

    clean_phone = normalize_phone(phone)

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language}
        }
    }

    if components:
        payload["template"]["components"] = components

    return await _send_request(phone_id, payload)


async def send_image_message(
    phone: str,
    image_url: str = None,
    image_id: str = None,
    caption: str = None,
    phone_number_id: Optional[str] = None
) -> dict:
    """Send an image message."""
    phone_id = phone_number_id or get_default_phone_id()
    clean_phone = normalize_phone(phone)

    image_obj = {}
    if image_id:
        image_obj["id"] = image_id
    elif image_url:
        image_obj["link"] = image_url
    if caption:
        image_obj["caption"] = caption

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "image",
        "image": image_obj
    }

    return await _send_request(phone_id, payload)


async def send_document_message(
    phone: str,
    document_url: str = None,
    document_id: str = None,
    filename: str = None,
    caption: str = None,
    phone_number_id: Optional[str] = None
) -> dict:
    """Send a document/file message."""
    phone_id = phone_number_id or get_default_phone_id()
    clean_phone = normalize_phone(phone)

    doc_obj = {}
    if document_id:
        doc_obj["id"] = document_id
    elif document_url:
        doc_obj["link"] = document_url
    if filename:
        doc_obj["filename"] = filename
    if caption:
        doc_obj["caption"] = caption

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "document",
        "document": doc_obj
    }

    return await _send_request(phone_id, payload)


async def send_audio_message(
    phone: str,
    audio_url: str = None,
    audio_id: str = None,
    phone_number_id: Optional[str] = None
) -> dict:
    """Send an audio message."""
    phone_id = phone_number_id or get_default_phone_id()
    clean_phone = normalize_phone(phone)

    audio_obj = {}
    if audio_id:
        audio_obj["id"] = audio_id
    elif audio_url:
        audio_obj["link"] = audio_url

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "audio",
        "audio": audio_obj
    }

    return await _send_request(phone_id, payload)


async def send_video_message(
    phone: str,
    video_url: str = None,
    video_id: str = None,
    caption: str = None,
    phone_number_id: Optional[str] = None
) -> dict:
    """Send a video message."""
    phone_id = phone_number_id or get_default_phone_id()
    clean_phone = normalize_phone(phone)

    video_obj = {}
    if video_id:
        video_obj["id"] = video_id
    elif video_url:
        video_obj["link"] = video_url
    if caption:
        video_obj["caption"] = caption

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "video",
        "video": video_obj
    }

    return await _send_request(phone_id, payload)


async def send_location_message(
    phone: str,
    latitude: float,
    longitude: float,
    name: str = None,
    address: str = None,
    phone_number_id: Optional[str] = None
) -> dict:
    """Send a location message."""
    phone_id = phone_number_id or get_default_phone_id()
    clean_phone = normalize_phone(phone)

    location_obj = {"latitude": latitude, "longitude": longitude}
    if name:
        location_obj["name"] = name
    if address:
        location_obj["address"] = address

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "location",
        "location": location_obj
    }

    return await _send_request(phone_id, payload)


async def mark_message_as_read(message_id: str, phone_number_id: Optional[str] = None) -> dict:
    """Mark a message as read (sends blue ticks to customer)."""
    phone_id = phone_number_id or get_default_phone_id()

    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id
    }

    return await _send_request(phone_id, payload)


# ─── Media Download ─────────────────────────────────────────────

async def download_media(media_id: str) -> dict:
    """Get media URL from WhatsApp (to download files sent by customers)."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{WHATSAPP_API_URL}/{media_id}",
            headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
        )
        if response.status_code == 200:
            return response.json()
        return {"error": response.text}


async def get_media_bytes(media_url: str) -> bytes:
    """Download media content from WhatsApp CDN."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            media_url,
            headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
        )
        return response.content


# ─── Webhook Parsing ────────────────────────────────────────────

def parse_webhook_payload(payload: dict) -> list:
    """Parse incoming webhook from Meta and extract messages/status updates.

    Returns list of events:
    - {"type": "message", "phone_number_id": ..., "from": ..., "message": ...}
    - {"type": "status", "phone_number_id": ..., "status": ...}
    """
    events = []

    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                phone_number_id = value.get("metadata", {}).get("phone_number_id")

                # Incoming messages
                for message in value.get("messages", []):
                    contact = None
                    contacts = value.get("contacts", [])
                    if contacts:
                        contact = contacts[0]

                    events.append({
                        "type": "message",
                        "phone_number_id": phone_number_id,
                        "from": message.get("from"),
                        "contact_name": contact.get("profile", {}).get("name") if contact else None,
                        "message_id": message.get("id"),
                        "timestamp": message.get("timestamp"),
                        "message": message
                    })

                # Status updates (sent, delivered, read)
                for status in value.get("statuses", []):
                    events.append({
                        "type": "status",
                        "phone_number_id": phone_number_id,
                        "message_id": status.get("id"),
                        "status": status.get("status"),
                        "timestamp": status.get("timestamp"),
                        "recipient_id": status.get("recipient_id"),
                        "errors": status.get("errors")
                    })
    except Exception as e:
        print(f"Error parsing webhook: {e}")

    return events


def extract_message_content(message: dict) -> dict:
    """Extract content from a WhatsApp message object.

    Returns:
    {
        "type": "text" | "image" | "document" | "audio" | "video" | "location" | "sticker" | "contacts",
        "content": str (text content or caption),
        "media_id": str (for media messages),
        "media_mime": str,
        "filename": str (for documents),
        "latitude": float, "longitude": float (for location),
    }
    """
    msg_type = message.get("type", "text")
    result = {"type": msg_type, "content": "", "media_id": None, "media_mime": None, "filename": None}

    if msg_type == "text":
        result["content"] = message.get("text", {}).get("body", "")

    elif msg_type == "image":
        img = message.get("image", {})
        result["content"] = img.get("caption", "📷 תמונה")
        result["media_id"] = img.get("id")
        result["media_mime"] = img.get("mime_type")

    elif msg_type == "document":
        doc = message.get("document", {})
        result["content"] = doc.get("caption", f"📎 {doc.get('filename', 'מסמך')}")
        result["media_id"] = doc.get("id")
        result["media_mime"] = doc.get("mime_type")
        result["filename"] = doc.get("filename")

    elif msg_type == "audio":
        audio = message.get("audio", {})
        result["content"] = "🎵 הודעה קולית"
        result["media_id"] = audio.get("id")
        result["media_mime"] = audio.get("mime_type")

    elif msg_type == "video":
        video = message.get("video", {})
        result["content"] = video.get("caption", "🎬 סרטון")
        result["media_id"] = video.get("id")
        result["media_mime"] = video.get("mime_type")

    elif msg_type == "sticker":
        sticker = message.get("sticker", {})
        result["content"] = "🏷️ סטיקר"
        result["media_id"] = sticker.get("id")
        result["media_mime"] = sticker.get("mime_type")

    elif msg_type == "location":
        loc = message.get("location", {})
        result["content"] = f"📍 מיקום: {loc.get('name', '')}"
        result["latitude"] = loc.get("latitude")
        result["longitude"] = loc.get("longitude")

    elif msg_type == "contacts":
        result["content"] = "👤 איש קשר"

    elif msg_type == "reaction":
        reaction = message.get("reaction", {})
        result["content"] = f"תגובה: {reaction.get('emoji', '')}"

    elif msg_type == "interactive":
        interactive = message.get("interactive", {})
        if interactive.get("type") == "button_reply":
            result["content"] = interactive.get("button_reply", {}).get("title", "")
        elif interactive.get("type") == "list_reply":
            result["content"] = interactive.get("list_reply", {}).get("title", "")

    elif msg_type == "order":
        result["content"] = "🛒 הזמנה"

    elif msg_type == "button":
        btn = message.get("button", {})
        result["content"] = btn.get("text", "לחיצת כפתור")

    else:
        result["content"] = f"📎 הודעה ({msg_type})"

    return result


# ─── Helpers ────────────────────────────────────────────────────

def normalize_phone(phone: str) -> str:
    """Normalize Israeli phone number to international format (972...)."""
    phone = phone.replace("-", "").replace(" ", "").replace("+", "")

    # Israeli numbers
    if phone.startswith("0"):
        phone = "972" + phone[1:]
    elif not phone.startswith("972"):
        phone = "972" + phone

    return phone


def format_phone_display(phone: str) -> str:
    """Format phone for display (e.g. 972501234567 → 050-123-4567)."""
    phone = phone.replace("+", "")
    if phone.startswith("972"):
        local = "0" + phone[3:]
        if len(local) == 10:
            return f"{local[:3]}-{local[3:6]}-{local[6:]}"
        return local
    return phone


async def _send_request(phone_number_id: str, payload: dict) -> dict:
    """Send request to WhatsApp Cloud API."""
    if not WHATSAPP_TOKEN:
        print(f"[WhatsApp DEMO] Would send to {phone_number_id}: {json.dumps(payload, ensure_ascii=False)[:200]}")
        return {"demo": True, "message_id": f"demo_{datetime.utcnow().timestamp()}"}

    url = f"{WHATSAPP_API_URL}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        result = response.json()

        if response.status_code != 200:
            print(f"[WhatsApp ERROR] {response.status_code}: {result}")
            raise Exception(f"WhatsApp API error: {result.get('error', {}).get('message', 'Unknown error')}")

        return result
