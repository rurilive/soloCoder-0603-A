from app.database import Base, engine, SessionLocal
from app.models import User, UserRole
from app.security import get_password_hash


def init_default_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@example.com",
                full_name="Administrator",
                hashed_password=get_password_hash("admin123"),
                role=UserRole.ADMIN,
                is_active=True,
            )
            db.add(admin)
            print("Created default admin user: admin / admin123")
        demo = db.query(User).filter(User.username == "demo").first()
        if not demo:
            demo = User(
                username="demo",
                email="demo@example.com",
                full_name="Demo User",
                hashed_password=get_password_hash("demo123"),
                role=UserRole.USER,
                is_active=True,
            )
            db.add(demo)
            print("Created default demo user: demo / demo123")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    init_default_data()
    print("Database initialized with default data.")
