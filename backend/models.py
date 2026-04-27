from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    agent = "agent"


class UserStatus(str, enum.Enum):
    online = "online"
    busy = "busy"
    away = "away"


class ConversationStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    waiting = "waiting"
    closed = "closed"


class CategoryType(str, enum.Enum):
    service = "service"
    sales = "sales"


class MessageType(str, enum.Enum):
    text = "text"
    image = "image"
    video = "video"
    audio = "audio"
    file = "file"
    voice = "voice"
    sticker = "sticker"
    location = "location"
    contact = "contact"


class MessageDirection(str, enum.Enum):
    inbound = "inbound"
    outbound = "outbound"


class ReadStatus(str, enum.Enum):
    sent = "sent"
    delivered = "delivered"
    read = "read"


class CampaignStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"


class CampaignTargetType(str, enum.Enum):
    manual = "manual"
    category = "category"
    status = "status"


class PriorityLevel(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class RecipientStatus(str, enum.Enum):
    sent = "sent"
    delivered = "delivered"
    read = "read"
    replied = "replied"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.agent)
    status = Column(SAEnum(UserStatus), default=UserStatus.online)
    avatar_url = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversations_owned = relationship("Conversation", back_populates="owner", foreign_keys="Conversation.owner_id")
    messages_sent = relationship("Message", back_populates="sender")
    templates_created = relationship("Template", back_populates="creator")
    campaigns_created = relationship("Campaign", back_populates="creator")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    category = Column(SAEnum(CategoryType), default=CategoryType.service)
    notes = Column(Text, nullable=True)
    avatar_url = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversations = relationship("Conversation", back_populates="contact")


class Label(Base):
    __tablename__ = "labels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    color = Column(String(7), nullable=False, default="#378ADD")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    shared_with = Column(JSON, default=[])
    status = Column(SAEnum(ConversationStatus), default=ConversationStatus.open)
    category = Column(SAEnum(CategoryType), default=CategoryType.service)
    priority = Column(SAEnum(PriorityLevel), default=PriorityLevel.normal)
    labels = Column(JSON, default=[])
    is_new = Column(Boolean, default=True)
    phone_number_id = Column(String(50), nullable=True)  # WhatsApp phone_number_id for multi-number support
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_message_at = Column(DateTime(timezone=True), server_default=func.now())

    contact = relationship("Contact", back_populates="conversations")
    owner = relationship("User", back_populates="conversations_owned", foreign_keys=[owner_id])
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    content = Column(Text, nullable=False)
    message_type = Column(SAEnum(MessageType), default=MessageType.text)
    media_url = Column(String(500), nullable=True)
    direction = Column(SAEnum(MessageDirection), nullable=False)
    sent_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_read = Column(Boolean, default=False)
    read_status = Column(SAEnum(ReadStatus), default=ReadStatus.sent)
    is_internal_note = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    wa_message_id = Column(String(100), nullable=True, index=True)  # WhatsApp message ID for status tracking
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", back_populates="messages_sent")


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User", back_populates="templates_created")


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    target_type = Column(SAEnum(CampaignTargetType), default=CampaignTargetType.manual)
    target_value = Column(String(255), nullable=True)
    message_text = Column(Text, nullable=False)
    buttons = Column(JSON, nullable=True)
    status = Column(SAEnum(CampaignStatus), default=CampaignStatus.draft)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creator = relationship("User", back_populates="campaigns_created")
    recipients = relationship("CampaignRecipient", back_populates="campaign")


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=False)
    status = Column(SAEnum(RecipientStatus), default=RecipientStatus.sent)

    campaign = relationship("Campaign", back_populates="recipients")
    contact = relationship("Contact")
