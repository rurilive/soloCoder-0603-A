import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.database import Base, async_session, engine
from app.models import KnowledgeBase, SLARule, TicketPriority, User, UserRole

SAMPLE_KB_ARTICLES = [
    {
        "title": "如何重置密码",
        "content": "如果您忘记了密码，可以在登录页面点击"忘记密码"链接，输入您的注册邮箱，系统将发送一封包含重置链接的邮件。点击链接后，您可以设置新密码。新密码至少需要6个字符。如果未收到邮件，请检查垃圾邮件文件夹。",
        "category": "account",
        "tags": "密码 重置 忘记密码 登录",
    },
    {
        "title": "账号被锁定怎么办",
        "content": "如果您连续输入错误密码5次，账号将被临时锁定30分钟。30分钟后您可以再次尝试登录。如果需要立即解锁，请联系客服并提供您的注册邮箱和身份验证信息。客服验证身份后可以手动解锁您的账号。",
        "category": "account",
        "tags": "账号锁定 登录失败 解锁 安全",
    },
    {
        "title": "如何修改绑定邮箱",
        "content": "登录后进入"个人设置"页面，找到"邮箱设置"部分，点击"修改邮箱"。输入新邮箱地址后，系统会向新邮箱发送验证链接。点击验证链接后，邮箱即修改成功。旧邮箱会收到一封变更通知邮件。",
        "category": "account",
        "tags": "邮箱 修改 验证 个人设置",
    },
    {
        "title": "账单支付失败如何处理",
        "content": "如果支付失败，请首先确认您的银行卡余额是否充足、卡片是否过期。如果余额充足但仍支付失败，可能是银行风控拦截，建议联系发卡银行。您也可以尝试使用其他支付方式。如果问题持续存在，请保存支付失败的截图并提交工单联系客服。",
        "category": "billing",
        "tags": "支付 失败 银行卡 账单 退款",
    },
    {
        "title": "如何申请退款",
        "content": "在订单详情页面点击"申请退款"按钮，填写退款原因并提交。退款将在3-7个工作日内原路返回。如果超过7个工作日仍未到账，请联系客服并提供订单号。部分特殊商品可能不支持退款，详情请查看退款政策。",
        "category": "billing",
        "tags": "退款 订单 退款政策",
    },
    {
        "title": "页面加载缓慢的解决方案",
        "content": "如果页面加载缓慢，请尝试以下步骤：1. 清除浏览器缓存和Cookie；2. 尝试使用Chrome或Edge最新版本；3. 检查网络连接是否正常；4. 关闭浏览器插件后重试；5. 如果使用VPN，尝试关闭后访问。如果以上方法均无效，请提交工单并附上您的浏览器版本和截图。",
        "category": "technical",
        "tags": "页面慢 加载 缓存 浏览器 网络问题",
    },
    {
        "title": "如何查看和下载发票",
        "content": "登录后进入"我的订单"页面，找到对应订单，点击"查看发票"按钮。您可以选择下载PDF格式的电子发票或申请纸质发票。电子发票可立即下载，纸质发票将在5个工作日内寄出。如需开具增值税专用发票，请在订单页面选择"专票"并填写开票信息。",
        "category": "billing",
        "tags": "发票 下载 订单 增值税",
    },
    {
        "title": "两步验证设置指南",
        "content": "进入"安全设置"页面，开启两步验证功能。支持Google Authenticator和短信验证两种方式。推荐使用Google Authenticator，扫描二维码后每30秒生成一次性验证码。开启后，每次登录需输入验证码，大幅提升账号安全性。请务必保存好恢复码，以防丢失验证器时使用。",
        "category": "account",
        "tags": "两步验证 安全 Google 身份验证 验证码",
    },
    {
        "title": "API接口调用频率限制说明",
        "content": "为保证服务稳定性，API调用设有频率限制：免费版每分钟60次，专业版每分钟600次，企业版每分钟6000次。超过限制将返回429状态码。建议实现指数退避重试机制。如需更高限额，请联系商务团队升级套餐。",
        "category": "technical",
        "tags": "API 频率限制 429 接口 限流",
    },
    {
        "title": "数据导出和备份指南",
        "content": "进入"数据管理"页面，选择"数据导出"。支持CSV和JSON两种格式，可选择全量导出或按时间范围筛选。大数据量导出将以异步方式处理，完成后通过邮件通知。备份文件保留30天，请及时下载。企业版用户可配置自动定期备份。",
        "category": "technical",
        "tags": "数据导出 备份 CSV JSON 数据管理",
    },
]


async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin = User(
                username="admin",
                email="admin@example.com",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
            )
            session.add(admin)

        result = await session.execute(select(User).where(User.username == "agent1"))
        if not result.scalar_one_or_none():
            agent = User(
                username="agent1",
                email="agent1@example.com",
                password_hash=hash_password("agent123"),
                role=UserRole.agent,
            )
            session.add(agent)

        result = await session.execute(select(User).where(User.username == "user1"))
        if not result.scalar_one_or_none():
            user = User(
                username="user1",
                email="user1@example.com",
                password_hash=hash_password("user123"),
                role=UserRole.user,
            )
            session.add(user)

        for article_data in SAMPLE_KB_ARTICLES:
            result = await session.execute(
                select(KnowledgeBase).where(KnowledgeBase.title == article_data["title"])
            )
            if not result.scalar_one_or_none():
                article = KnowledgeBase(**article_data)
                session.add(article)

        DEFAULT_SLA_RULES = [
            {"category": "general", "priority": TicketPriority.low, "response": 120, "resolution": 2880},
            {"category": "general", "priority": TicketPriority.medium, "response": 60, "resolution": 1440},
            {"category": "general", "priority": TicketPriority.high, "response": 30, "resolution": 480},
            {"category": "general", "priority": TicketPriority.urgent, "response": 15, "resolution": 120},
            {"category": "technical", "priority": TicketPriority.low, "response": 120, "resolution": 4320},
            {"category": "technical", "priority": TicketPriority.medium, "response": 60, "resolution": 2880},
            {"category": "technical", "priority": TicketPriority.high, "response": 30, "resolution": 720},
            {"category": "technical", "priority": TicketPriority.urgent, "response": 15, "resolution": 240},
            {"category": "billing", "priority": TicketPriority.low, "response": 120, "resolution": 2880},
            {"category": "billing", "priority": TicketPriority.medium, "response": 60, "resolution": 1440},
            {"category": "billing", "priority": TicketPriority.high, "response": 20, "resolution": 360},
            {"category": "billing", "priority": TicketPriority.urgent, "response": 10, "resolution": 60},
            {"category": "account", "priority": TicketPriority.low, "response": 120, "resolution": 2880},
            {"category": "account", "priority": TicketPriority.medium, "response": 60, "resolution": 1440},
            {"category": "account", "priority": TicketPriority.high, "response": 20, "resolution": 360},
            {"category": "account", "priority": TicketPriority.urgent, "response": 10, "resolution": 120},
        ]

        for sla_data in DEFAULT_SLA_RULES:
            result = await session.execute(
                select(SLARule).where(
                    SLARule.category == sla_data["category"],
                    SLARule.priority == sla_data["priority"],
                )
            )
            if not result.scalar_one_or_none():
                rule = SLARule(
                    category=sla_data["category"],
                    priority=sla_data["priority"],
                    response_time_minutes=sla_data["response"],
                    resolution_time_minutes=sla_data["resolution"],
                    warning_threshold=0.75,
                    auto_escalate=False,
                    is_active=True,
                )
                session.add(rule)

        await session.commit()

    print("Database initialized with default users and knowledge base:")
    print("  admin  / admin123  (admin)")
    print("  agent1 / agent123  (agent)")
    print("  user1  / user123   (user)")
    print(f"  {len(SAMPLE_KB_ARTICLES)} knowledge base articles seeded")


if __name__ == "__main__":
    asyncio.run(init())
