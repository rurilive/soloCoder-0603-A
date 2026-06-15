import random
import hashlib
from typing import Optional
from schemas import ImageReviewResult


class ImageModerationService:
    def __init__(self):
        self.unsafe_keywords = [
            "sexy", "porn", "nude", "sex", "裸体", "色情", "性感", "成人",
            "xxx", "adult", "erotic"
        ]

    def review(self, image_url: Optional[str]) -> Optional[ImageReviewResult]:
        if not image_url:
            return None
        return self._simulate_review(image_url)

    def _simulate_review(self, image_url: str) -> ImageReviewResult:
        url_lower = image_url.lower()

        for keyword in self.unsafe_keywords:
            if keyword in url_lower:
                return ImageReviewResult(
                    result="unsafe",
                    confidence=random.randint(85, 98),
                    reason=f"检测到敏感关键词: {keyword}"
                )

        hash_val = hashlib.md5(image_url.encode()).hexdigest()
        hash_int = int(hash_val[:8], 16)
        random.seed(hash_int)
        rand = random.randint(1, 100)

        if rand <= 15:
            return ImageReviewResult(
                result="unsafe",
                confidence=random.randint(70, 85),
                reason="图片内容疑似违规，需人工确认"
            )
        elif rand <= 35:
            return ImageReviewResult(
                result="uncertain",
                confidence=random.randint(40, 70),
                reason="图片内容不确定，需人工审核"
            )
        else:
            return ImageReviewResult(
                result="safe",
                confidence=random.randint(80, 99),
                reason="图片内容正常"
            )


image_service = ImageModerationService()
