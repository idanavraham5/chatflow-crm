"""Seed database with essential data only (no demo data)."""
from datetime import datetime
from sqlalchemy.orm import Session
from models import (
    User, Template, Label,
    UserRole, UserStatus
)
from auth import get_password_hash


def seed(db: Session):
    # Check if already seeded
    if db.query(User).first():
        return

    # ── Admin User ──
    admin = User(
        name="מנהל המערכת",
        username="admin",
        password_hash=get_password_hash("admin123"),
        role=UserRole.admin,
        status=UserStatus.online
    )
    db.add(admin)
    db.flush()

    # ── Labels ──
    labels = [
        Label(name="VIP", color="#EF4444", created_by=admin.id),
        Label(name="דחוף", color="#F97316", created_by=admin.id),
        Label(name="ממתין ללקוח", color="#3B82F6", created_by=admin.id),
        Label(name="ממתין למנהל", color="#8B5CF6", created_by=admin.id),
        Label(name="מכירה פוטנציאלית", color="#25D366", created_by=admin.id),
        Label(name="תלונה", color="#EC4899", created_by=admin.id),
        Label(name="החזר כספי", color="#F59E0B", created_by=admin.id),
        Label(name="טכני", color="#14B8A6", created_by=admin.id),
    ]
    db.add_all(labels)
    db.flush()

    # ── Templates ──
    templates = [
        Template(title="ברכת פתיחה", content="שלום {שם}! ברוכים הבאים ל'יש לי זכות'. איך נוכל לעזור לך היום?", created_by=admin.id),
        Template(title="תודה על הפנייה", content="היי {שם}, תודה שפנית אלינו! קיבלנו את ההודעה שלך ונציג יטפל בה בהקדם.", created_by=admin.id),
        Template(title="שעות פעילות", content="שעות הפעילות שלנו:\nימים א'-ה': 9:00-18:00\nיום ו': 9:00-13:00\n\nנשמח לעזור בכל שאלה!", created_by=admin.id),
        Template(title="חוץ משעות פעילות", content="שלום {שם}, תודה על הפנייה. כרגע אנחנו מחוץ לשעות הפעילות. נחזור אליך ביום העסקים הבא. תודה על הסבלנות!", created_by=admin.id),
        Template(title="בודקים ומעדכנים", content="קיבלתי, אני בודק את הנושא ואחזור אליך עם תשובה בהקדם.", created_by=admin.id),
        Template(title="ממתינים לתשובתך", content="שלום {שם}, רציתי לוודא שקיבלת את ההודעה האחרונה שלנו. האם יש משהו נוסף שנוכל לעזור בו?", created_by=admin.id),
        Template(title="תזכורת מעקב", content="היי {שם}, רק רציתי לעקוב אחרי הפנייה שלך. האם הנושא טופל? אנחנו כאן אם צריך עוד עזרה.", created_by=admin.id),
        Template(title="סיום טיפול", content="שמחנו לעזור! אם יש עוד שאלות בעתיד, אנחנו תמיד כאן בשבילך. יום נעים!", created_by=admin.id),
        Template(title="סיכום טיפול", content="שלום {שם}, רציתי לסכם את הפנייה שלך:\n\n נושא: [נושא]\n פתרון: [פתרון]\n\nאם יש שאלות נוספות, אנחנו זמינים!", created_by=admin.id),
    ]
    db.add_all(templates)

    db.commit()
    print("✅ Database seeded with admin user, labels, and templates.")
