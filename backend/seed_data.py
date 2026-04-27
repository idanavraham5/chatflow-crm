"""Seed database with Hebrew demo data."""
from datetime import datetime, timedelta
import random
from sqlalchemy.orm import Session
from models import (
    User, Contact, Conversation, Message, Template, Campaign,
    CampaignRecipient, UserRole, UserStatus, CategoryType,
    ConversationStatus, MessageType, MessageDirection, ReadStatus,
    CampaignStatus, CampaignTargetType, RecipientStatus,
    Label, PriorityLevel
)
from auth import get_password_hash


def seed(db: Session):
    # Check if already seeded
    if db.query(User).first():
        return

    now = datetime.utcnow()

    # ── Users ──
    users = [
        User(name="מנהל המערכת", username="admin", password_hash=get_password_hash("admin123"),
             role=UserRole.admin, status=UserStatus.online),
        User(name="יעל כהן", username="agent1", password_hash=get_password_hash("1234"),
             role=UserRole.agent, status=UserStatus.online),
        User(name="אורי לוי", username="agent2", password_hash=get_password_hash("1234"),
             role=UserRole.agent, status=UserStatus.online),
        User(name="נועה מזרחי", username="agent3", password_hash=get_password_hash("1234"),
             role=UserRole.agent, status=UserStatus.busy),
        User(name="דניאל אברהם", username="agent4", password_hash=get_password_hash("1234"),
             role=UserRole.agent, status=UserStatus.away),
        User(name="שירה פרץ", username="agent5", password_hash=get_password_hash("1234"),
             role=UserRole.agent, status=UserStatus.online),
    ]
    db.add_all(users)
    db.flush()

    # ── Contacts ──
    contact_data = [
        ("דוד כהן", "050-1234567", CategoryType.service),
        ("רחל לוי", "052-9876543", CategoryType.sales),
        ("משה ישראלי", "054-5551234", CategoryType.service),
        ("שרה אברהמי", "053-7778899", CategoryType.sales),
        ("יוסף חדד", "050-3334455", CategoryType.service),
        ("מרים ביטון", "058-6667788", CategoryType.service),
        ("אברהם מזרחי", "052-1112233", CategoryType.sales),
        ("לאה גולדברג", "054-4445566", CategoryType.service),
        ("יצחק רבין", "050-8889900", CategoryType.sales),
        ("רבקה שמעוני", "053-2223344", CategoryType.service),
        ("שמעון פרץ", "058-9990011", CategoryType.sales),
        ("חנה נחמני", "052-5556677", CategoryType.service),
        ("עמוס עוז", "054-3334455", CategoryType.service),
        ("נעמי שמר", "050-7778899", CategoryType.sales),
        ("אריה דרעי", "053-1112233", CategoryType.service),
        ("תמר ברק", "058-4445566", CategoryType.sales),
        ("גדעון סער", "052-8889900", CategoryType.service),
        ("אסתר המלכה", "054-2223344", CategoryType.sales),
        ("בני גנץ", "050-6667788", CategoryType.service),
        ("מיכל אנסקי", "053-9990011", CategoryType.sales),
    ]
    contacts = []
    for name, phone, cat in contact_data:
        c = Contact(name=name, phone=phone, category=cat)
        contacts.append(c)
        db.add(c)
    db.flush()

    # ── Labels ──
    label_data = [
        Label(name="VIP", color="#EF4444", created_by=1),
        Label(name="דחוף", color="#F97316", created_by=1),
        Label(name="ממתין ללקוח", color="#3B82F6", created_by=1),
        Label(name="ממתין למנהל", color="#8B5CF6", created_by=1),
        Label(name="מכירה פוטנציאלית", color="#25D366", created_by=1),
        Label(name="תלונה", color="#EC4899", created_by=1),
        Label(name="החזר כספי", color="#F59E0B", created_by=1),
        Label(name="טכני", color="#14B8A6", created_by=1),
    ]
    db.add_all(label_data)
    db.flush()

    # ── Conversations ──
    statuses = [ConversationStatus.open, ConversationStatus.in_progress,
                ConversationStatus.waiting, ConversationStatus.closed]
    priorities = [PriorityLevel.low, PriorityLevel.normal, PriorityLevel.normal,
                  PriorityLevel.high, PriorityLevel.urgent]

    conversations = []
    for i in range(35):
        contact = contacts[i % len(contacts)]
        owner = users[1 + (i % 5)]  # agents 1-5
        status = statuses[i % 4]
        priority = priorities[i % len(priorities)]
        cat = contact.category
        created = now - timedelta(days=random.randint(0, 14), hours=random.randint(0, 23))

        shared = []
        if i % 7 == 0:  # Some conversations shared
            shared = [users[1 + ((i + 2) % 5)].id]

        # Assign some labels
        conv_labels = []
        if i % 3 == 0:
            conv_labels.append(label_data[0].id)  # VIP
        if i % 5 == 0:
            conv_labels.append(label_data[4].id)  # מכירה פוטנציאלית
        if priority == PriorityLevel.urgent:
            conv_labels.append(label_data[1].id)  # דחוף

        conv = Conversation(
            contact_id=contact.id,
            owner_id=owner.id if i % 6 != 0 else None,  # Some unassigned
            shared_with=shared,
            status=status,
            category=cat,
            priority=priority,
            labels=conv_labels if conv_labels else [],
            is_new=i < 5,  # First 5 are new
            created_at=created,
            updated_at=created + timedelta(hours=random.randint(1, 48)),
            last_message_at=created + timedelta(hours=random.randint(1, 48))
        )
        conversations.append(conv)
        db.add(conv)
    db.flush()

    # ── Messages ──
    message_templates_inbound = [
        "שלום, אני צריך עזרה בנושא הביטוח שלי",
        "היי, מתי אתם פתוחים?",
        "אפשר לקבל פרטים על השירות?",
        "תודה רבה על העזרה!",
        "אני מחכה לתשובה כבר שעתיים...",
        "יש לי שאלה לגבי החשבון",
        "מתי המשלוח אמור להגיע?",
        "אני לא מרוצה מהשירות",
        "אפשר לדבר עם מנהל?",
        "זה דחוף מאוד, בבקשה תחזרו אליי",
        "קיבלתי הודעה על חיוב שלא ביצעתי",
        "אני רוצה לבטל את המנוי",
        "האם יש מבצע מיוחד החודש?",
        "צריך לעדכן את הכתובת שלי",
        "שלחתי מייל ולא קיבלתי תשובה",
        "מעוניין בהצעת מחיר",
        "יש בעיה עם האפליקציה",
        "אשמח לשמוע על החבילות שלכם",
        "הטכנאי לא הגיע בזמן",
        "מתי אפשר לקבוע פגישה?",
    ]

    message_templates_outbound = [
        "שלום! איך אפשר לעזור?",
        "בדקתי את הנושא, הנה מה שמצאתי:",
        "אנחנו פתוחים בימים א'-ה' 9:00-18:00",
        "בשמחה! שולח לך פרטים נוספים",
        "מצטער על ההמתנה, אני מטפל בזה עכשיו",
        "בדקתי מול המחלקה הרלוונטית",
        "המשלוח צפוי להגיע תוך 3-5 ימי עסקים",
        "אני מעביר אותך לנציג בכיר שיוכל לסייע",
        "תודה שפנית אלינו! יש עוד משהו?",
        "אני בודק את זה ואחזור אליך בהקדם",
        "החזר כספי בוצע בהצלחה",
        "הנה הקישור להצעת המחיר:",
        "עדכנתי את הפרטים במערכת",
        "פותח קריאת שירות בנושא",
        "הבעיה תוקנה, אפשר לנסות שוב",
    ]

    internal_notes = [
        "לקוח VIP - לטפל בעדיפות גבוהה",
        "ממתין לאישור מהמנהל",
        "צריך להעביר למחלקת מכירות",
        "הלקוח התקשר גם בטלפון",
        "בדקתי - הבעיה בצד שלנו",
    ]

    for conv in conversations:
        num_messages = random.randint(3, 15)
        base_time = conv.created_at

        for j in range(num_messages):
            msg_time = base_time + timedelta(minutes=random.randint(5, 120) * (j + 1))

            # Alternate between inbound and outbound, starting with inbound
            if j % 3 == 0:
                direction = MessageDirection.inbound
                content = random.choice(message_templates_inbound)
                sent_by = None
                is_note = False
            elif j % 5 == 0 and j > 0:
                # Internal note
                direction = MessageDirection.outbound
                content = random.choice(internal_notes)
                sent_by = conv.owner_id
                is_note = True
            else:
                direction = MessageDirection.outbound
                content = random.choice(message_templates_outbound)
                sent_by = conv.owner_id
                is_note = False

            read_stat = random.choice([ReadStatus.sent, ReadStatus.delivered, ReadStatus.read])
            if direction == MessageDirection.inbound:
                read_stat = ReadStatus.read

            msg = Message(
                conversation_id=conv.id,
                content=content,
                message_type=MessageType.text,
                direction=direction,
                sent_by=sent_by,
                is_read=direction == MessageDirection.outbound or random.choice([True, True, False]),
                read_status=read_stat,
                is_internal_note=is_note,
                created_at=msg_time
            )
            db.add(msg)

        # Update last_message_at
        conv.last_message_at = base_time + timedelta(minutes=random.randint(5, 120) * num_messages)

    db.flush()

    # ── Templates ──
    templates = [
        # פתיחת שיחה
        Template(title="ברכת פתיחה", content="שלום {שם}! ברוכים הבאים ל'יש לי זכות'. איך נוכל לעזור לך היום?", created_by=1),
        Template(title="תודה על הפנייה", content="היי {שם}, תודה שפנית אלינו! קיבלנו את ההודעה שלך ונציג יטפל בה בהקדם.", created_by=1),

        # זמינות ושעות
        Template(title="שעות פעילות", content="שעות הפעילות שלנו:\nימים א'-ה': 9:00-18:00\nיום ו': 9:00-13:00\n\nנשמח לעזור בכל שאלה!", created_by=1),
        Template(title="חוץ משעות פעילות", content="שלום {שם}, תודה על הפנייה. כרגע אנחנו מחוץ לשעות הפעילות. נחזור אליך ביום העסקים הבא. תודה על הסבלנות!", created_by=1),

        # המתנה ומעקב
        Template(title="בודקים ומעדכנים", content="קיבלתי, אני בודק את הנושא ואחזור אליך עם תשובה בהקדם.", created_by=1),
        Template(title="ממתינים לתשובתך", content="שלום {שם}, רציתי לוודא שקיבלת את ההודעה האחרונה שלנו. האם יש משהו נוסף שנוכל לעזור בו?", created_by=1),
        Template(title="תזכורת מעקב", content="היי {שם}, רק רציתי לעקוב אחרי הפנייה שלך. האם הנושא טופל? אנחנו כאן אם צריך עוד עזרה.", created_by=1),

        # סיום שיחה
        Template(title="סיום טיפול", content="שמחנו לעזור! אם יש עוד שאלות בעתיד, אנחנו תמיד כאן בשבילך. יום נעים! 😊", created_by=1),
        Template(title="סיכום טיפול", content="שלום {שם}, רציתי לסכם את הפנייה שלך:\n\n📌 נושא: [נושא]\n✅ פתרון: [פתרון]\n\nאם יש שאלות נוספות, אנחנו זמינים!", created_by=1),

        # מכירות
        Template(title="הצעת מחיר", content="שלום {שם}, שמחים לשלוח לך את הצעת המחיר המבוקשת.\n\n📋 פירוט:\n[פרטי ההצעה]\n\nלפרטים נוספים או שאלות — אנחנו זמינים!", created_by=1),
        Template(title="מבצע מיוחד", content="היי {שם}! יש לנו מבצע מיוחד שחשבנו שיעניין אותך 🎉\n\n[פרטי המבצע]\n\nהמבצע בתוקף עד [תאריך]. מעוניין לשמוע עוד?", created_by=1),
        Template(title="תיאום פגישה", content="שלום {שם}, נשמח לתאם פגישה כדי לדבר על הצרכים שלך.\n\nמה השעות הנוחות לך? אפשר גם שיחת וידאו.", created_by=1),

        # שירות
        Template(title="בקשת פרטים", content="שלום {שם}, כדי שנוכל לטפל בפנייתך בצורה הטובה ביותר, נצטרך ממך:\n\n1. [פרט 1]\n2. [פרט 2]\n3. [פרט 3]\n\nתודה מראש!", created_by=1),
        Template(title="העברה לנציג מתאים", content="שלום {שם}, אני מעביר את הפנייה שלך לנציג המתמחה בנושא. הוא יצור איתך קשר בהקדם.", created_by=1),
        Template(title="התנצלות ופיצוי", content="שלום {שם}, אנחנו מצטערים מאוד על חוסר הנוחות שנגרמה לך. אנחנו לוקחים את זה ברצינות ומטפלים בנושא.\n\n[פרטי הפיצוי/פתרון]", created_by=1),
    ]
    db.add_all(templates)

    # ── Campaigns ──
    campaigns_data = [
        Campaign(
            name="מבצע חורף 2024",
            created_by=1,
            target_type=CampaignTargetType.category,
            target_value="sales",
            message_text="שלום! לרגל עונת החורף, יש לנו מבצע מיוחד! 20% הנחה על כל השירותים. מעוניינים לשמוע פרטים?",
            buttons=[{"text": "כן, אשמח!"}, {"text": "לא תודה"}, {"text": "התקשרו אליי"}],
            status=CampaignStatus.sent,
            sent_at=now - timedelta(days=5)
        ),
        Campaign(
            name="סקר שביעות רצון",
            created_by=1,
            target_type=CampaignTargetType.category,
            target_value="service",
            message_text="שלום! נשמח לשמוע את דעתך על השירות שקיבלת. האם היית ממליץ עלינו?",
            buttons=[{"text": "בהחלט!"}, {"text": "יש מה לשפר"}],
            status=CampaignStatus.sent,
            sent_at=now - timedelta(days=2)
        ),
        Campaign(
            name="השקת שירות חדש",
            created_by=1,
            target_type=CampaignTargetType.manual,
            target_value=None,
            message_text="חדשות מרגשות! השקנו שירות ייעוץ מקוון. לפרטים נוספים לחצו כאן.",
            buttons=[{"text": "ספרו לי עוד"}],
            status=CampaignStatus.draft
        ),
    ]
    for camp in campaigns_data:
        db.add(camp)
    db.flush()

    # Add recipients to sent campaigns
    for camp in campaigns_data[:2]:
        target_contacts = [c for c in contacts if c.category.value == camp.target_value]
        for contact in target_contacts[:8]:
            status = random.choice([RecipientStatus.sent, RecipientStatus.delivered,
                                   RecipientStatus.read, RecipientStatus.replied])
            recipient = CampaignRecipient(
                campaign_id=camp.id,
                contact_id=contact.id,
                status=status
            )
            db.add(recipient)

    db.commit()
    print("✅ Database seeded successfully with Hebrew demo data!")
