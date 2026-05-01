import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ─── Database URL ─────────────────────────────────────────────
# Priority: DATABASE_URL env var > SQLite fallback for local dev
DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    # Local development fallback — SQLite
    DB_PATH = os.path.join(BASE_DIR, "chatflow.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Render gives postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ─── Engine Configuration ─────────────────────────────────────
if "sqlite" in DATABASE_URL:
    # SQLite — local dev only
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # PostgreSQL — production with connection pooling
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,          # 10 connections in the pool (enough for 11 agents)
        max_overflow=5,        # 5 extra connections under burst
        pool_recycle=300,      # Recycle connections every 5 min (avoid stale connections)
        pool_pre_ping=True,    # Test connection health before use
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
