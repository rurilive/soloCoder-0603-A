from fastapi import APIRouter, Response, HTTPException
from fastapi.responses import StreamingResponse
from ..captcha import CaptchaGenerator
from ..limiter import limiter

router = APIRouter()

@router.get("/captcha/image")
def get_captcha():
    captcha_text = CaptchaGenerator.generate()
    captcha_id = limiter.generate_captcha_id()
    limiter.store_captcha(captcha_id, captcha_text)
    
    image_buffer = CaptchaGenerator.generate_image(captcha_text)
    
    return StreamingResponse(image_buffer, media_type="image/png", headers={
        "X-Captcha-Id": captcha_id
    })

@router.post("/captcha/verify")
def verify_captcha(captcha_id: str, captcha_text: str):
    if not limiter.verify_captcha(captcha_id, captcha_text):
        raise HTTPException(status_code=400, detail="验证码无效或已过期")
    
    return {"success": True, "message": "验证码验证成功"}