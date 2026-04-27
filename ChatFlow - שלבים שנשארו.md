# ChatFlow CRM — מה נשאר לעשות

## מצב נוכחי

המערכת **עובדת במצב דמו מלא** על המחשב המקומי עם:
- Frontend: React + Vite + Tailwind (RTL עברית)
- Backend: FastAPI + SQLAlchemy + SQLite
- אבטחה: bcrypt 14 rounds, JWT + Refresh Tokens, Rate Limiting, Token Blacklist, Security Headers, Audit Logging, Input Sanitization
- WebSocket: הודעות בזמן אמת
- כל הבאגים תוקנו (20 באגים נמצאו ותוקנו)

כרגע ההודעות הנכנסות הן **מדומות (mock)** — כל 30 שניות נשלחת הודעה אקראית. כדי להפוך את המערכת לאמיתית צריך לחבר WhatsApp Business API.

---

## שלב 1: הגדרת WhatsApp Business API (אתה עושה)

### 1.1 — פתיחת אפליקציית Meta Developer
- כנס ל: https://developers.facebook.com
- לחץ "Create App" → בחר "Business" → תן שם (למשל "ChatFlow CRM")
- בתוך האפליקציה: לחץ "Add Product" → בחר "WhatsApp"

### 1.2 — הגדרת מספר טלפון
- בהגדרות WhatsApp באפליקציה, לחץ "Add Phone Number"
- הכנס את המספר המאומת שלך מ-Meta Business
- תקבל קוד אימות ב-SMS — הכנס אותו

### 1.3 — יצירת Access Token קבוע
- בהגדרות האפליקציה: "System Users" → צור System User
- תן לו הרשאות: `whatsapp_business_messaging`, `whatsapp_business_management`
- צור Permanent Access Token עם ההרשאות האלה
- **שמור את הטוקן במקום בטוח** — תצטרך אותו בשלב 3

### 1.4 — הגדרת Webhook
- ב-WhatsApp Product Settings → Configuration
- Callback URL: `https://YOUR_DOMAIN/api/webhook/whatsapp`
- Verify Token: בחר מילת סוד (למשל: `chatflow_verify_2024`)
- Subscribe to: `messages`, `message_deliveries`, `message_reads`
- **שים לב**: ה-Webhook דורש HTTPS עם דומיין אמיתי (לא localhost)

### מה תצטרך לתת לקלוד:
```
WHATSAPP_TOKEN=הטוקן_הקבוע_שיצרת
WHATSAPP_PHONE_ID=מזהה_המספר_מ_Meta
WHATSAPP_VERIFY_TOKEN=מילת_הסוד_שבחרת
WHATSAPP_BUSINESS_ID=מזהה_העסק_מ_Meta
```

---

## שלב 2: שרת ודומיין (אתה עושה)

### 2.1 — רכישת שרת VPS
- **המלצה**: DigitalOcean Droplet או AWS Lightsail
- **מינימום**: 2GB RAM, 1 CPU, 25GB SSD
- **מערכת הפעלה**: Ubuntu 22.04 LTS
- **עלות**: ~$12-24/חודש

### 2.2 — רכישת דומיין
- אם יש לך דומיין קיים, אפשר להשתמש בתת-דומיין (למשל `crm.yeshlizhut.co.il`)
- אם אין — רכוש דומיין (Namecheap, GoDaddy, וכד')
- **הפנה את הדומיין לכתובת IP של השרת** (A Record ב-DNS)

### 2.3 — גישת SSH
- ודא שיש לך גישת SSH לשרת
- **תן לקלוד**: כתובת IP של השרת, שם הדומיין

---

## שלב 3: חיבור WhatsApp API (קלוד עושה)

### 3.1 — יצירת Webhook Endpoint
- ראוטר חדש `routers/webhook.py` שמקבל הודעות מ-Meta
- Verification endpoint (GET) עם ה-Verify Token
- Message handler (POST) שמקבל הודעות נכנסות

### 3.2 — שליחת הודעות אמיתיות
- פונקציה `send_whatsapp_message(phone, content)` שקוראת ל-WhatsApp Cloud API
- תמיכה בסוגי הודעות: טקסט, תמונה, מסמך, אודיו
- החלפת ה-mock messages בהודעות אמיתיות

### 3.3 — קבלת הודעות נכנסות
- פענוח Webhook payload מ-Meta
- שמירה כ-Message עם direction=inbound
- עדכון סטטוס הודעות (delivered, read) מ-Webhook callbacks
- שליחת WebSocket notification לנציגים

### 3.4 — תבניות WhatsApp (Templates)
- חיבור Templates לתבניות WhatsApp מאושרות ב-Meta
- שליחת הודעה ראשונה חייבת להיות Template (דרישת Meta)

---

## שלב 4: העברה ל-Production (קלוד עושה)

### 4.1 — שדרוג בסיס נתונים
- מעבר מ-SQLite ל-PostgreSQL (חובה לפרודקשן)
- Migration script להעברת נתונים קיימים
- Connection pooling מוגדר

### 4.2 — Docker + Deployment
- Dockerfile לפרונט ולבק
- docker-compose.yml עם PostgreSQL, Redis, Nginx
- Nginx כ-reverse proxy עם SSL (Let's Encrypt)
- Auto-restart ו-health checks

### 4.3 — משתני סביבה (Environment Variables)
```
SECRET_KEY=מפתח_אקראי_ארוך
REFRESH_SECRET_KEY=מפתח_אקראי_ארוך_נפרד
DATABASE_URL=postgresql://user:pass@localhost/chatflow
REDIS_URL=redis://localhost:6379
ALLOWED_ORIGINS=https://crm.yeshlizhut.co.il
ENV=production
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_ID=...
WHATSAPP_VERIFY_TOKEN=...
```

### 4.4 — אבטחת Production
- Token blacklist ב-Redis (במקום in-memory)
- Rate limiting ב-Redis (שורד restart)
- HTTPS חובה (HSTS מוגדר)
- Firewall: פתוח רק פורטים 80, 443, 22

### 4.5 — SSL/HTTPS
- התקנת Certbot (Let's Encrypt) — SSL חינמי
- חידוש אוטומטי

---

## שלב 5: שיפורים אופציונליים (קלוד עושה — לפי בקשה)

### 5.1 — AI / בינה מלאכותית
- תשובות אוטומטיות חכמות (OpenAI/Claude API)
- סיווג אוטומטי של שיחות לפי נושא
- הצעת תשובות לנציג

### 5.2 — דוחות מתקדמים
- ייצוא ל-Excel/PDF
- דוחות ביצועי נציגים
- גרפים מתקדמים (זמן תגובה ממוצע, שביעות רצון)

### 5.3 — אינטגרציות
- חיבור ל-CRM קיים (Monday, Salesforce וכד')
- חיבור לגוגל קלנדר (תזמון פגישות)
- Zapier/Make webhooks

### 5.4 — נוטיפיקציות
- Push notifications בדפדפן
- התראות מייל על שיחות חדשות
- Telegram bot לנציגים

---

## סדר עדיפויות — מה לעשות ראשון

| # | משימה | מי עושה | זמן משוער | עלות |
|---|--------|---------|-----------|------|
| 1 | הגדרת Meta Developer App + WhatsApp | אתה | 1-2 שעות | חינם |
| 2 | רכישת שרת VPS | אתה | 30 דקות | $12-24/חודש |
| 3 | דומיין + DNS | אתה | 30 דקות | $10-15/שנה (אם חדש) |
| 4 | חיבור WhatsApp API | קלוד | 2-3 שעות עבודה | חינם |
| 5 | העברה ל-Production + Docker | קלוד | 3-4 שעות עבודה | חינם |
| 6 | SSL + אבטחת שרת | קלוד | 1 שעה עבודה | חינם |
| 7 | בדיקות סופיות | קלוד + אתה | 1-2 שעות | — |

**סה"כ עלויות חודשיות**: ~$12-24 (שרת) + WhatsApp API (חינם עד 1,000 שיחות/חודש, אח"כ ~$0.05 לשיחה)

---

## פקודות הרצה נוכחיות (מצב דמו)

### Backend:
```bash
cd "C:\Users\עידן\Desktop\דיגיטל 99 - קווארק\chatflow\backend"
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend:
```bash
cd "C:\Users\עידן\Desktop\דיגיטל 99 - קווארק\chatflow\frontend"
npm install
npm run dev
```

### כניסה למערכת:
- כתובת: http://localhost:5173
- **אדמין**: admin / Admin123!
- **נציג**: sarah / Agent123!

---

## מבנה הקבצים

```
chatflow/
├── backend/
│   ├── main.py              # שרת ראשי + middleware
│   ├── auth.py              # אבטחה, JWT, bcrypt, rate limiting
│   ├── models.py            # מודלים (User, Conversation, Message, Contact, etc.)
│   ├── schemas.py           # Pydantic schemas
│   ├── database.py          # חיבור SQLite/PostgreSQL
│   ├── seed_data.py         # נתוני דמו
│   ├── websocket_manager.py # WebSocket manager
│   ├── requirements.txt     
│   └── routers/
│       ├── auth.py          # login, refresh, logout, change-password
│       ├── conversations.py # CRUD שיחות + העברה + שיתוף
│       ├── messages.py      # הודעות + WebSocket notifications
│       ├── contacts.py      # אנשי קשר
│       ├── agents.py        # ניהול נציגים
│       ├── templates.py     # תבניות הודעות
│       ├── campaigns.py     # קמפיינים
│       └── dashboard.py     # סטטיסטיקות
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # ניתוב + Auth Context
│   │   ├── api.js           # API client + auto refresh
│   │   ├── pages/           # Login, Chat, Dashboard, Campaigns, Agents
│   │   ├── components/      # Sidebar, ConversationList, ChatWindow, ContactCard, etc.
│   │   └── hooks/           # useWebSocket
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
```

---

## הערות חשובות לקלוד הבא

1. **אל תיגע באבטחה** — כבר מותקנת מערכת אבטחה מלאה (bcrypt 14 rounds, JWT refresh, rate limiting, token blacklist, security headers, audit logging). אל תשנה את auth.py אלא אם מבקשים ממך.

2. **WebSocket עובד עם useRef** — ה-hook ב-useWebSocket.js כתוב עם useRef כדי למנוע reconnect loops. אל תחזיר אותו ל-useCallback.

3. **SQLite עובד עם JSON columns** — `shared_with` ב-Conversation הוא Column(JSON) ולא ARRAY. הסינון נעשה ב-Python.

4. **Mock messages** — ב-main.py יש `mock_incoming_messages()` שרץ כל 30 שניות. כשמחברים WhatsApp אמיתי, צריך להסיר או לכבות את זה.

5. **Seed data** — ב-seed_data.py יש נתוני דמו. בפרודקשן צריך להפעיל seed רק פעם ראשונה או לא בכלל.
