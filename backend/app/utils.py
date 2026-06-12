import qrcode
import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from io import BytesIO
from base64 import b64encode
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

def generate_waitlist_offer_token() -> str:
    import uuid
    return str(uuid.uuid4()).replace("-", "").lower()

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

def get_smtp_config():
    return {
        "server": os.getenv("SMTP_SERVER", "smtp.example.com"),
        "port": int(os.getenv("SMTP_PORT", 587)),
        "username": os.getenv("SMTP_USERNAME", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "sender_email": os.getenv("SMTP_SENDER_EMAIL", "noreply@example.com"),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() == "true",
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").lower() == "true"
    }

def send_waitlist_notification_email(to_email: str, event_title: str, offer_token: str, frontend_url: str = "http://localhost:5173") -> dict:
    smtp_config = get_smtp_config()
    
    if not smtp_config["username"] or not smtp_config["password"]:
        logger.warning("SMTP credentials not configured, skipping email notification")
        return {
            "success": False,
            "error": "SMTP credentials not configured",
            "message": "Email notification skipped due to missing SMTP configuration"
        }
    
    try:
        confirm_url = f"{frontend_url}/waitlist/confirm/{offer_token}"
        
        msg = MIMEMultipart()
        msg['From'] = smtp_config["sender_email"]
        msg['To'] = to_email
        msg['Subject'] = f"恭喜！您已获得 {event_title} 的递补报名资格"
        
        body = f"""
        <html>
        <body>
        <h2>恭喜您！</h2>
        <p>您已从候补名单中递补，获得了 <strong>{event_title}</strong> 的报名资格。</p>
        <p>请在 <strong>24小时内</strong> 点击下方链接确认是否接受名额：</p>
        <p><a href="{confirm_url}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">确认接受名额</a></p>
        <p>如果您在24小时内未确认，系统将自动判定您放弃递补机会，名额将顺延给下一位候补人员。</p>
        <p>确认链接：{confirm_url}</p>
        <br>
        <p>此致</p>
        <p>活动报名系统</p>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        if smtp_config["use_ssl"]:
            with smtplib.SMTP_SSL(smtp_config["server"], smtp_config["port"]) as server:
                server.login(smtp_config["username"], smtp_config["password"])
                text = msg.as_string()
                server.sendmail(smtp_config["sender_email"], to_email, text)
        else:
            with smtplib.SMTP(smtp_config["server"], smtp_config["port"]) as server:
                if smtp_config["use_tls"]:
                    server.starttls()
                server.login(smtp_config["username"], smtp_config["password"])
                text = msg.as_string()
                server.sendmail(smtp_config["sender_email"], to_email, text)
        
        logger.info(f"Successfully sent waitlist notification email to {to_email}")
        return {
            "success": True,
            "error": None,
            "message": "Email sent successfully"
        }
        
    except smtplib.SMTPAuthenticationError as e:
        error_msg = f"SMTP authentication failed: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "message": "邮件发送失败：SMTP认证失败，请检查用户名和密码"
        }
    except smtplib.SMTPConnectError as e:
        error_msg = f"SMTP connection failed: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "message": "邮件发送失败：无法连接到SMTP服务器"
        }
    except smtplib.SMTPException as e:
        error_msg = f"SMTP error occurred: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "message": f"邮件发送失败：{str(e)}"
        }
    except Exception as e:
        error_msg = f"Unexpected error sending email: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "message": "邮件发送失败：未知错误"
        }