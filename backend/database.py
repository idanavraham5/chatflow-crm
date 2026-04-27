import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# In production, use persistent disk path
# Render: /var/data, Docker: /app/data, Local: ./chatflow.db
if os.getenv("DB_PATH"):
    DB_PATH = os.getenv("DB_PATH")
elif os.getenv("ENV") == "production" and os.path.isdir("/var/data"):
    DB_PATH = "/var/data/chatflow.db"
elif os.getenv("ENV") == "production" and os.path.isdir("/app/data"):
    DB_PATH = "/app/data/chatflow.db"
else:
    DB_PATH = os.path.join(BASE_DIR, "chatflow.db")

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
