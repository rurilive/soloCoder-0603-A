import random
import string
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

class CaptchaGenerator:
    @staticmethod
    def generate(length=4):
        characters = string.ascii_letters + string.digits
        return ''.join(random.choices(characters, k=length))
    
    @staticmethod
    def generate_image(text, width=120, height=40):
        image = Image.new('RGB', (width, height), (255, 255, 255))
        draw = ImageDraw.Draw(image)
        
        try:
            font = ImageFont.truetype('arial.ttf', 28)
        except:
            font = ImageFont.load_default()
        
        for i, char in enumerate(text):
            x = 10 + i * 25
            y = random.randint(5, 15)
            color = (random.randint(0, 150), random.randint(0, 150), random.randint(0, 150))
            draw.text((x, y), char, font=font, fill=color)
        
        for _ in range(50):
            x = random.randint(0, width - 1)
            y = random.randint(0, height - 1)
            draw.point((x, y), fill=(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)))
        
        for _ in range(5):
            x1 = random.randint(0, width - 1)
            y1 = random.randint(0, height - 1)
            x2 = random.randint(0, width - 1)
            y2 = random.randint(0, height - 1)
            draw.line((x1, y1, x2, y2), fill=(random.randint(0, 200), random.randint(0, 200), random.randint(0, 200)), width=1)
        
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        return buffer