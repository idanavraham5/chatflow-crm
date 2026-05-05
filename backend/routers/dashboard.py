from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract, case
from datetime import datetime, timedelta, timezone
from database import get_db
from models import User, Conversation, Message, ConversationStatus, UserRole, MessageDirection
from schemas import DashboardResponse, DashboardStats, AgentStats
from auth import require_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    days: int = Query(default=7, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    date_from = now - timedelta(days=days)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Basic stats ──
    open_count = db.query(func.count(Conversation.id)).filter(
        Conversation.status == ConversationStatus.open
    ).scalar()

    in_progress_count = db.query(func.count(Conversation.id)).filter(
        Conversation.status == ConversationStatus.in_progress
    ).scalar()

    closed_today = db.query(func.count(Conversation.id)).filter(
        Conversation.status == ConversationStatus.closed,
        Conversation.updated_at >= today_start
    ).scalar()

    total_conversations = db.query(func.count(Conversation.id)).filter(
        Conversation.created_at >= date_from
    ).scalar()

    # ── Messages today ──
    messages_sent_today = db.query(func.count(Message.id)).filter(
        Message.direction == MessageDirection.outbound,
        Message.created_at >= today_start,
        Message.is_internal_note == False
    ).scalar()

    messages_received_today = db.query(func.count(Message.id)).filter(
        Message.direction == MessageDirection.inbound,
        Message.created_at >= today_start
    ).scalar()

    # ── Unanswered conversations ──
    # Conversations where last message is inbound (customer waiting for response)
    all_active_convs = db.query(Conversation).filter(
        Conversation.status.in_([ConversationStatus.open, ConversationStatus.in_progress])
    ).all()

    unanswered = 0
    for conv in all_active_convs:
        last_msg = db.query(Message).filter(
            Message.conversation_id == conv.id,
            Message.is_internal_note == False
        ).order_by(Message.created_at.desc()).first()
        if last_msg and last_msg.direction == MessageDirection.inbound:
            unanswered += 1

    # ── Average response time (real calculation) ──
    # For each inbound message, find the next outbound message and calculate diff
    response_times = []
    recent_inbound = db.query(Message).filter(
        Message.direction == MessageDirection.inbound,
        Message.created_at >= date_from
    ).order_by(Message.created_at.desc()).limit(200).all()

    for inbound_msg in recent_inbound:
        next_outbound = db.query(Message).filter(
            Message.conversation_id == inbound_msg.conversation_id,
            Message.direction == MessageDirection.outbound,
            Message.is_internal_note == False,
            Message.created_at > inbound_msg.created_at
        ).order_by(Message.created_at.asc()).first()
        if next_outbound:
            diff = (next_outbound.created_at - inbound_msg.created_at).total_seconds() / 60
            if diff < 1440:  # Ignore responses after 24h
                response_times.append(diff)

    avg_response = round(sum(response_times) / len(response_times), 1) if response_times else 0

    stats = DashboardStats(
        open_conversations=open_count,
        in_progress_conversations=in_progress_count,
        closed_today=closed_today,
        avg_response_time=avg_response,
        messages_sent_today=messages_sent_today,
        messages_received_today=messages_received_today,
        unanswered_conversations=unanswered,
        total_conversations=total_conversations
    )

    # ── Conversations by day ──
    convs_by_day = []
    for i in range(days):
        day = (now - timedelta(days=days - 1 - i)).date()
        day_start_dt = datetime.combine(day, datetime.min.time())
        day_end = day_start_dt + timedelta(days=1)
        count = db.query(func.count(Conversation.id)).filter(
            Conversation.created_at >= day_start_dt,
            Conversation.created_at < day_end
        ).scalar()
        convs_by_day.append({"date": day.isoformat(), "count": count})

    # ── Messages by day (sent + received) ──
    msgs_by_day = []
    for i in range(days):
        day = (now - timedelta(days=days - 1 - i)).date()
        day_start_dt = datetime.combine(day, datetime.min.time())
        day_end = day_start_dt + timedelta(days=1)
        sent = db.query(func.count(Message.id)).filter(
            Message.direction == MessageDirection.outbound,
            Message.is_internal_note == False,
            Message.created_at >= day_start_dt,
            Message.created_at < day_end
        ).scalar()
        received = db.query(func.count(Message.id)).filter(
            Message.direction == MessageDirection.inbound,
            Message.created_at >= day_start_dt,
            Message.created_at < day_end
        ).scalar()
        msgs_by_day.append({"date": day.isoformat(), "sent": sent, "received": received})

    # ── By category ──
    service_count = db.query(func.count(Conversation.id)).filter(
        Conversation.category == "service",
        Conversation.created_at >= date_from
    ).scalar()
    sales_count = db.query(func.count(Conversation.id)).filter(
        Conversation.category == "sales",
        Conversation.created_at >= date_from
    ).scalar()

    # ── Messages by hour (inbound) ──
    all_inbound = db.query(Message).filter(
        Message.direction == MessageDirection.inbound,
        Message.created_at >= date_from
    ).all()
    hour_counts_in = {h: 0 for h in range(24)}
    for m in all_inbound:
        if m.created_at:
            hour_counts_in[m.created_at.hour] += 1
    convs_by_hour = [{"hour": h, "count": hour_counts_in[h]} for h in range(24)]

    # ── Messages by hour (outbound) ──
    all_outbound = db.query(Message).filter(
        Message.direction == MessageDirection.outbound,
        Message.is_internal_note == False,
        Message.created_at >= date_from
    ).all()
    hour_counts_out = {h: 0 for h in range(24)}
    for m in all_outbound:
        if m.created_at:
            hour_counts_out[m.created_at.hour] += 1
    msgs_by_hour = [{"hour": h, "inbound": hour_counts_in[h], "outbound": hour_counts_out[h]} for h in range(24)]

    # ── Agent stats ──
    all_agents = db.query(User).filter(User.role.in_([UserRole.agent, UserRole.admin])).all()
    agent_stats = []
    for agent in all_agents:
        agent_open = db.query(func.count(Conversation.id)).filter(
            Conversation.owner_id == agent.id,
            Conversation.status.in_([ConversationStatus.open, ConversationStatus.in_progress])
        ).scalar()

        agent_closed = db.query(func.count(Conversation.id)).filter(
            Conversation.owner_id == agent.id,
            Conversation.status == ConversationStatus.closed,
            Conversation.updated_at >= today_start
        ).scalar()

        # Messages sent in period
        agent_msgs = db.query(func.count(Message.id)).filter(
            Message.sent_by == agent.id,
            Message.direction == MessageDirection.outbound,
            Message.is_internal_note == False,
            Message.created_at >= date_from
        ).scalar()

        # Messages sent today
        agent_msgs_today = db.query(func.count(Message.id)).filter(
            Message.sent_by == agent.id,
            Message.direction == MessageDirection.outbound,
            Message.is_internal_note == False,
            Message.created_at >= today_start
        ).scalar()

        # Real avg response time per agent
        agent_response_times = []
        agent_inbound = db.query(Message).filter(
            Message.direction == MessageDirection.inbound,
            Message.created_at >= date_from,
            Message.conversation_id.in_(
                db.query(Conversation.id).filter(Conversation.owner_id == agent.id)
            )
        ).order_by(Message.created_at.desc()).limit(50).all()

        for inbound_msg in agent_inbound:
            next_out = db.query(Message).filter(
                Message.conversation_id == inbound_msg.conversation_id,
                Message.direction == MessageDirection.outbound,
                Message.is_internal_note == False,
                Message.sent_by == agent.id,
                Message.created_at > inbound_msg.created_at
            ).order_by(Message.created_at.asc()).first()
            if next_out:
                diff = (next_out.created_at - inbound_msg.created_at).total_seconds() / 60
                if diff < 1440:
                    agent_response_times.append(diff)

        agent_avg = round(sum(agent_response_times) / len(agent_response_times), 1) if agent_response_times else 0

        agent_stats.append(AgentStats(
            id=agent.id,
            name=agent.name,
            status=agent.status.value,
            open_count=agent_open,
            closed_today=agent_closed,
            avg_response_time=agent_avg,
            messages_sent=agent_msgs,
            messages_sent_today=agent_msgs_today
        ))

    # Sort agents by messages sent (top performer first)
    agent_stats.sort(key=lambda a: a.messages_sent, reverse=True)

    return DashboardResponse(
        stats=stats,
        agents=agent_stats,
        conversations_by_day=convs_by_day,
        messages_by_day=msgs_by_day,
        conversations_by_category={"service": service_count, "sales": sales_count},
        conversations_by_hour=convs_by_hour,
        messages_by_hour=msgs_by_hour
    )
