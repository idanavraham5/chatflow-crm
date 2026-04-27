from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime
from database import get_db
from models import User, Campaign, CampaignRecipient, Contact, CampaignStatus, RecipientStatus, Conversation, ConversationStatus
from schemas import CampaignCreate, CampaignResponse, CampaignRecipientResponse
from auth import get_current_user, require_admin
from websocket_manager import manager
from whatsapp import send_text_message, get_default_phone_id, WHATSAPP_TOKEN

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


def campaign_to_response(camp, db) -> CampaignResponse:
    creator = db.query(User).filter(User.id == camp.created_by).first()
    recipients = db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == camp.id).all()
    delivered = sum(1 for r in recipients if r.status.value in ("delivered", "read", "replied"))
    read = sum(1 for r in recipients if r.status.value in ("read", "replied"))

    return CampaignResponse(
        id=camp.id,
        name=camp.name,
        created_by=camp.created_by,
        creator_name=creator.name if creator else None,
        target_type=camp.target_type.value,
        target_value=camp.target_value,
        message_text=camp.message_text,
        buttons=camp.buttons,
        status=camp.status.value,
        sent_at=camp.sent_at,
        created_at=camp.created_at,
        recipients_count=len(recipients),
        delivered_count=delivered,
        read_count=read
    )


@router.get("/", response_model=List[CampaignResponse])
def list_campaigns(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).all()
    return [campaign_to_response(c, db) for c in campaigns]


@router.post("/", response_model=CampaignResponse)
def create_campaign(
    data: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    campaign = Campaign(
        name=data.name,
        created_by=current_user.id,
        target_type=data.target_type,
        target_value=data.target_value,
        message_text=data.message_text,
        buttons=data.buttons
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    # Determine recipients
    contacts = []
    if data.target_type == "manual" and data.contact_ids:
        contacts = db.query(Contact).filter(Contact.id.in_(data.contact_ids)).all()
    elif data.target_type == "category" and data.target_value:
        contacts = db.query(Contact).filter(Contact.category == data.target_value).all()
    elif data.target_type == "status":
        pass  # Can be expanded

    for contact in contacts:
        recipient = CampaignRecipient(
            campaign_id=campaign.id,
            contact_id=contact.id
        )
        db.add(recipient)

    db.commit()
    db.refresh(campaign)
    return campaign_to_response(campaign, db)


@router.post("/{campaign_id}/send", response_model=CampaignResponse)
async def send_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status == CampaignStatus.sent:
        raise HTTPException(status_code=400, detail="Campaign already sent")

    # Send via WhatsApp Cloud API to each recipient
    campaign.status = CampaignStatus.sent
    campaign.sent_at = datetime.utcnow()

    send_errors = 0
    for recipient in campaign.recipients:
        contact = db.query(Contact).filter(Contact.id == recipient.contact_id).first()
        if not contact:
            continue
        try:
            result = await send_text_message(contact.phone, campaign.message_text)
            wa_msg_id = result.get("messages", [{}])[0].get("id") if not result.get("demo") else None
            recipient.status = RecipientStatus.sent if wa_msg_id else RecipientStatus.delivered
        except Exception as e:
            print(f"Campaign send error to {contact.phone}: {e}")
            recipient.status = RecipientStatus.sent
            send_errors += 1

    db.commit()
    db.refresh(campaign)

    await manager.broadcast({
        "type": "campaign_sent",
        "campaign_id": campaign_id,
        "name": campaign.name
    })

    return campaign_to_response(campaign, db)


@router.get("/{campaign_id}/recipients", response_model=List[CampaignRecipientResponse])
def get_recipients(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    recipients = db.query(CampaignRecipient).filter(
        CampaignRecipient.campaign_id == campaign_id
    ).all()

    result = []
    for r in recipients:
        contact = db.query(Contact).filter(Contact.id == r.contact_id).first()
        result.append(CampaignRecipientResponse(
            id=r.id,
            contact_id=r.contact_id,
            contact_name=contact.name if contact else None,
            status=r.status.value if hasattr(r.status, 'value') else r.status
        ))
    return result
