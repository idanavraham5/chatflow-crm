from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract
from datetime import datetime, timedelta
from database import get_db
from models import User, Conversation, Message, ConversationStatus, UserRole, MessageDirection
from schemas import DashboardResponse, DashboardStats, AgentStats
from auth import require_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    days: int = Query(default=7, ge=1, le=365),
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    now = datetime.utcnow()

    if start_date and end_date:
        date_from = datetime.fromisoformat(start_date)
        date_to = datetime.fromisoformat(end_date)
    else:
        date_from = now - timedelta(days=days)
        date_to = now

    # Stats
    open_count = db.query(func.count(Conversation.id)).filter(
        Conversation.status == ConversationStatus.open
    ).scalar()

    in_progress_count = db.query(func.count(Conversation.id)).filter(
        Conversation.status == ConversationStatus.in_progress
    ).scalar()

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    closed_today = db.query(func.count(Conversation.id)).filter(
        Conversation.status == ConversationStatus.closed,
        Conversation.updated_at >= today_start
    ).scalar()

    # Average response time (simplified mock)
    avg_response = 4.5  # minutes, mock value

    stats = DashboardStats(
        open_conversations=open_count,
        in_progress_conversations=in_progress_count,
        closed_today=closed_today,
        avg_response_time=avg_response
    )

    # Conversations by day
    convs_by_day = []
    for i in range(days):
        day = (now - timedelta(days=days - 1 - i)).date()
        day_start = datetime.combine(day, datetime.min.time())
        day_end = day_start + timedelta(days=1)
        count = db.query(func.count(Conversation.id)).filter(
            Conversation.created_at >= day_start,
            Conversation.created_at < day_end
        ).scalar()
        convs_by_day.append({"date": day.isoformat(), "count": count})

    # By category
    service_count = db.query(func.count(Conversation.id)).filter(
        Conversation.category == "service",
        Conversation.created_at >= date_from
    ).scalar()
    sales_count = db.query(func.count(Conversation.id)).filter(
        Conversation.category == "sales",
        Conversation.created_at >= date_from
    ).scalar()

    # By hour — fetch all messages and group in Python (SQLite compatible)
    all_inbound = db.query(Message).filter(
        Message.direction == MessageDirection.inbound,
        Message.created_at >= date_from
    ).all()
    hour_counts = {h: 0 for h in range(24)}
    for m in all_inbound:
        if m.created_at:
            hour_counts[m.created_at.hour] += 1
    convs_by_hour = [{"hour": h, "count": hour_counts[h]} for h in range(24)]

    # Agent stats
    agents = db.query(User).filter(User.role == UserRole.agent).all()
    agent_stats = []
    for agent in agents:
        agent_open = db.query(func.count(Conversation.id)).filter(
            Conversation.owner_id == agent.id,
            Conversation.status.in_([ConversationStatus.open, ConversationStatus.in_progress])
        ).scalar()

        agent_closed = db.query(func.count(Conversation.id)).filter(
            Conversation.owner_id == agent.id,
            Conversation.status == ConversationStatus.closed,
            Conversation.updated_at >= today_start
        ).scalar()

        agent_stats.append(AgentStats(
            id=agent.id,
            name=agent.name,
            status=agent.status.value,
            open_count=agent_open,
            closed_today=agent_closed,
            avg_response_time=round(3.0 + (agent.id % 5) * 1.2, 1)  # Mock
        ))

    return DashboardResponse(
        stats=stats,
        agents=agent_stats,
        conversations_by_day=convs_by_day,
        conversations_by_category={"service": service_count, "sales": sales_count},
        conversations_by_hour=convs_by_hour
    )
