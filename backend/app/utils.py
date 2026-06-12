import qrcode
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from io import BytesIO
from base64 import b64encode
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional

SECRET_KEY = "your-secret-key-keep-it-safe-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def generate_ticket_code() -> str:
    import uuid
    return str(uuid.uuid4()).replace("-", "").upper()[:12]

def generate_qr_code(data: str) -> str:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return b64encode(buffer.getvalue()).decode("utf-8")

SMTP_CONFIG = {
    "server": "smtp.example.com",
    "port": 587,
    "username": "noreply@example.com",
    "password": "your-email-password",
    "sender_email": "noreply@example.com"
}

def send_waitlist_notification_email(to_email: str, event_title: str) -> bool:
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_CONFIG["sender_email"]
        msg['To'] = to_email
        msg['Subject'] = f"恭喜！您已成功获得 {event_title} 的报名资格"
        
        body = f"""
        <html>
        <body>
        <h2>恭喜您！</h2>
        <p>您已从候补名单中成功递补，获得了 <strong>{event_title}</strong> 的报名资格。</p>
        <p>请登录系统查看您的报名详情。</p>
        <p>如有任何问题，请联系活动主办方。</p>
        <br>
        <p>此致</p>
        <p>活动报名系统</p>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        with smtplib.SMTP(SMTP_CONFIG["server"], SMTP_CONFIG["port"]) as server:
            server.starttls()
            server.login(SMTP_CONFIG["username"], SMTP_CONFIG["password"])
            text = msg.as_string()
            server.sendmail(SMTP_CONFIG["sender_email"], to_email, text)
        
        return True
    except Exception as e:
        print(f"Failed to send email: {str(e)}")
        return False