import re
from typing import List, Tuple
from sqlalchemy.orm import Session
from models import AutoReviewRule
from schemas import AutoReviewResult


class AutoModerationEngine:
    def __init__(self, db: Session):
        self.db = db
        self.PASS_THRESHOLD = -5
        self.REJECT_THRESHOLD = 5

    def get_active_rules(self) -> List[AutoReviewRule]:
        return self.db.query(AutoReviewRule).filter(AutoReviewRule.enabled == True).all()

    def review(self, title: str, body: str) -> AutoReviewResult:
        rules = self.get_active_rules()
        total_score = 0
        matched_rules = []
        reasons = []

        content = f"{title}\n{body}"

        for rule in rules:
            if self._match_rule(rule, content):
                total_score += rule.score
                matched_rules.append(rule.id)
                reasons.append(f"规则[{rule.name}]: {rule.description or rule.pattern}")

        result = "manual"
        if total_score <= self.PASS_THRESHOLD:
            result = "auto_pass"
        elif total_score >= self.REJECT_THRESHOLD:
            result = "auto_reject"

        reason = "; ".join(reasons) if reasons else "无匹配规则"

        return AutoReviewResult(
            result=result,
            score=total_score,
            reason=reason,
            matched_rules=matched_rules
        )

    def _match_rule(self, rule: AutoReviewRule, content: str) -> bool:
        if rule.rule_type in ["keyword", "regex"]:
            pattern_str = rule.pattern.strip().strip("|")
            if not pattern_str:
                return False
            try:
                flags = re.IGNORECASE if rule.rule_type == "keyword" else 0
                pattern = re.compile(pattern_str, flags)
                match = pattern.search(content)
                return bool(match) and bool(match.group(0))
            except re.error:
                return False
        elif rule.rule_type == "length_min":
            try:
                min_len = int(rule.pattern)
                return len(content) < min_len
            except ValueError:
                return False
        elif rule.rule_type == "length_max":
            try:
                max_len = int(rule.pattern)
                return len(content) > max_len
            except ValueError:
                return False
        return False


def fix_existing_rules(db: Session):
    rules = db.query(AutoReviewRule).filter(
        AutoReviewRule.rule_type.in_(["keyword", "regex"]),
        AutoReviewRule.pattern.like("%|")
    ).all()
    for rule in rules:
        cleaned = rule.pattern.strip().strip("|")
        if cleaned != rule.pattern:
            rule.pattern = cleaned
    db.commit()


def init_default_rules(db: Session):
    fix_existing_rules(db)

    existing = db.query(AutoReviewRule).first()
    if existing:
        return

    default_rules = [
        AutoReviewRule(
            name="敏感词-广告",
            rule_type="keyword",
            pattern="加微信|加好友|联系电话|扫码关注|赚钱|兼职|推广|广告",
            action="reject",
            score=10,
            enabled=True,
            description="检测广告相关词汇"
        ),
        AutoReviewRule(
            name="敏感词-违规",
            rule_type="keyword",
            pattern="赌博|色情|暴力|毒品|枪支",
            action="reject",
            score=15,
            enabled=True,
            description="检测违规内容"
        ),
        AutoReviewRule(
            name="内容过短",
            rule_type="length_min",
            pattern="10",
            action="manual",
            score=3,
            enabled=True,
            description="内容少于10字符，需人工审核"
        ),
        AutoReviewRule(
            name="优质内容-长度足够",
            rule_type="length_max",
            pattern="500",
            action="pass",
            score=-3,
            enabled=True,
            description="内容较长，倾向通过"
        ),
        AutoReviewRule(
            name="安全词-正常词汇",
            rule_type="keyword",
            pattern="你好|谢谢|分享|学习|交流|讨论|推荐",
            action="pass",
            score=-2,
            enabled=True,
            description="包含正常礼貌用语"
        )
    ]

    for rule in default_rules:
        db.add(rule)
    db.commit()
