from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    admin = "admin"
    agent = "agent"


class UserStatus(str, Enum):
    online = "online"
    busy = "busy"
    away = "away"


class ConversationStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    waiting = "waiting"
    closed = "closed"


class CategoryType(str, Enum):
    service = "service"
    sales = "sales"


class MessageDirection(str, Enum):
    inbound = "inbound"
    outbound = "outbound"


class PriorityLevel(str, Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class ReadStatusEnum(str, Enum):
    sent = "sent"
    delivered = "delivered"
    read = "read"


# Auth
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"


# User
class UserBase(BaseModel):
    name: str
    username: str
    role: UserRole = UserRole.agent


class UserCreate(UserBase):
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    username: str
    role: UserRole
    status: UserStatus
    avatar_url: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[UserStatus] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    new_password: str


# Contact
class ContactBase(BaseModel):
    name: str
    phone: str
    category: CategoryType = CategoryType.service
    notes: Optional[str] = None
    avatar_url: Optional[str] = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    category: Optional[CategoryType] = None
    notes: Optional[str] = None
    avatar_url: Optional[str] = None


class ContactResponse(BaseModel):
    id: int
    name: str
    phone: str
    category: CategoryType
    notes: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Message
class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"
    media_url: Optional[str] = None
    is_internal_note: bool = False


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    content: str
    message_type: str
    media_url: Optional[str] = None
    direction: MessageDirection
    sent_by: Optional[int] = None
    sender_name: Optional[str] = None
    is_read: bool
    read_status: ReadStatusEnum
    is_internal_note: bool
    deleted_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Conversation
class ConversationResponse(BaseModel):
    id: int
    contact_id: int
    contact: ContactResponse
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    shared_with: Optional[List[int]] = []
    status: ConversationStatus
    category: CategoryType
    priority: PriorityLevel = PriorityLevel.normal
    labels: Optional[List[int]] = []
    is_new: bool = False
    phone_number_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    last_message: Optional[str] = None
    unread_count: int = 0

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    contact_id: Optional[int] = None
    phone: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = "service"
    phone_number_id: Optional[str] = None


class ConversationUpdate(BaseModel):
    status: Optional[ConversationStatus] = None
    category: Optional[CategoryType] = None
    owner_id: Optional[int] = None
    priority: Optional[PriorityLevel] = None
    labels: Optional[List[int]] = None
    is_new: Optional[bool] = None


class TransferRequest(BaseModel):
    agent_id: int


class ShareRequest(BaseModel):
    agent_id: int


# Label
class LabelCreate(BaseModel):
    name: str
    color: str = "#378ADD"


class LabelUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class LabelResponse(BaseModel):
    id: int
    name: str
    color: str
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


# Template
class TemplateBase(BaseModel):
    title: str
    content: str


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class TemplateResponse(BaseModel):
    id: int
    title: str
    content: str
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


# Campaign
class CampaignCreate(BaseModel):
    name: str
    target_type: str = "manual"
    target_value: Optional[str] = None
    message_text: str
    buttons: Optional[List[dict]] = None
    contact_ids: Optional[List[int]] = None


class CampaignRecipientResponse(BaseModel):
    id: int
    contact_id: int
    contact_name: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class CampaignResponse(BaseModel):
    id: int
    name: str
    created_by: int
    creator_name: Optional[str] = None
    target_type: str
    target_value: Optional[str] = None
    message_text: str
    buttons: Optional[List[dict]] = None
    status: str
    sent_at: Optional[datetime] = None
    created_at: datetime
    recipients_count: int = 0
    delivered_count: int = 0
    read_count: int = 0

    class Config:
        from_attributes = True


# Dashboard
class DashboardStats(BaseModel):
    open_conversations: int
    in_progress_conversations: int
    closed_today: int
    avg_response_time: float


class AgentStats(BaseModel):
    id: int
    name: str
    status: str
    open_count: int
    closed_today: int
    avg_response_time: float


class DashboardResponse(BaseModel):
    stats: DashboardStats
    agents: List[AgentStats]
    conversations_by_day: List[dict]
    conversations_by_category: dict
    conversations_by_hour: List[dict]
