import asyncio
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.content import ContentType, Field, ContentEntry, EntryTranslation
from app.models.user import User, Role, Permission, RolePermission


async def get_or_create_content_type(db: AsyncSession, slug: str, name: str, description: str):
    result = await db.execute(select(ContentType).where(ContentType.slug == slug))
    ct = result.scalar_one_or_none()
    if ct:
        print(f"  Content type '{slug}' already exists, skipping.")
        return ct, False
    ct = ContentType(slug=slug, name=name, description=description, is_active=True)
    db.add(ct)
    await db.flush()
    print(f"  + Created content type: {name} ({slug})")
    return ct, True


async def create_fields_if_not_exists(db: AsyncSession, content_type_id: int, fields_data: list):
    result = await db.execute(
        select(Field).where(Field.content_type_id == content_type_id)
    )
    existing = {f.name: f for f in result.scalars().all()}
    created = 0
    for fd in fields_data:
        if fd["name"] not in existing:
            db.add(Field(content_type_id=content_type_id, **fd))
            created += 1
    if created > 0:
        print(f"    + Created {created} fields")
    else:
        print(f"    Fields already exist, skipping.")
    return created


async def get_or_create_entry_with_translations(
    db: AsyncSession, content_type_id: int, default_lang_slug: str, translations_data: list
):
    entry_id = None
    trans_result = await db.execute(
        select(EntryTranslation).where(EntryTranslation.slug == default_lang_slug)
    )
    default_trans = trans_result.scalar_one_or_none()

    if default_trans:
        entry_id = default_trans.entry_id
        print(f"  Entry (id={entry_id}) already exists, checking translations...")

        existing_result = await db.execute(
            select(EntryTranslation).where(EntryTranslation.entry_id == entry_id)
        )
        existing_langs = {t.language_code for t in existing_result.scalars().all()}

        added = 0
        for td in translations_data:
            if td["language_code"] not in existing_langs:
                db.add(EntryTranslation(entry_id=entry_id, **td))
                added += 1
        if added > 0:
            print(f"    + Added {added} missing translations")
        else:
            print(f"    All translations already exist")
        return None
    else:
        entry = ContentEntry(
            content_type_id=content_type_id,
            status="published",
            published_at=datetime.utcnow(),
        )
        db.add(entry)
        await db.flush()
        entry_id = entry.id

        for td in translations_data:
            db.add(EntryTranslation(entry_id=entry_id, **td))

        print(f"  + Created new entry (id={entry_id}) with {len(translations_data)} translations")
        return entry


async def seed_users_roles(db: AsyncSession):
    print("Roles & Permissions:")

    permissions_data = [
        {"name": "管理用户", "codename": "manage_users", "description": "创建、编辑、删除用户"},
        {"name": "管理角色", "codename": "manage_roles", "description": "创建、编辑角色和分配权限"},
        {"name": "管理内容类型", "codename": "manage_content_types", "description": "创建、编辑内容类型和字段"},
        {"name": "编辑内容", "codename": "edit_content", "description": "创建、编辑、删除内容条目"},
        {"name": "发布内容", "codename": "publish_content", "description": "发布和下架内容"},
        {"name": "创建翻译任务", "codename": "create_translation", "description": "创建并分配翻译任务"},
        {"name": "执行翻译", "codename": "perform_translation", "description": "执行翻译并提交完成"},
        {"name": "审校翻译", "codename": "review_translation", "description": "审校翻译质量，通过或驳回"},
        {"name": "查看所有任务", "codename": "view_all_tasks", "description": "查看所有翻译任务"},
        {"name": "分配任务", "codename": "assign_tasks", "description": "分配翻译任务给翻译人员"},
    ]

    created_perms = {}
    for pd in permissions_data:
        result = await db.execute(select(Permission).where(Permission.codename == pd["codename"]))
        perm = result.scalar_one_or_none()
        if not perm:
            perm = Permission(**pd)
            db.add(perm)
            await db.flush()
            print(f"  + Created permission: {pd['codename']}")
        created_perms[pd["codename"]] = perm

    roles_data = [
        {
            "name": "admin",
            "description": "系统管理员，拥有所有权限",
            "permissions": [p["codename"] for p in permissions_data],
        },
        {
            "name": "editor",
            "description": "内容编辑，可以创建内容并发起翻译任务",
            "permissions": ["manage_content_types", "edit_content", "publish_content", "create_translation", "view_all_tasks", "assign_tasks"],
        },
        {
            "name": "translator",
            "description": "翻译人员，执行翻译任务",
            "permissions": ["perform_translation"],
        },
        {
            "name": "reviewer",
            "description": "审校人员，审核翻译质量",
            "permissions": ["review_translation", "view_all_tasks"],
        },
    ]

    created_roles = {}
    for rd in roles_data:
        result = await db.execute(select(Role).where(Role.name == rd["name"]))
        role = result.scalar_one_or_none()
        if not role:
            role = Role(name=rd["name"], description=rd["description"])
            db.add(role)
            await db.flush()
            print(f"  + Created role: {rd['name']}")
        created_roles[rd["name"]] = role

        perm_codenames = rd["permissions"]
        for codename in perm_codenames:
            perm = created_perms.get(codename)
            if perm:
                rp_result = await db.execute(
                    select(RolePermission).where(
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == perm.id,
                    )
                )
                if not rp_result.scalar_one_or_none():
                    rp = RolePermission(role_id=role.id, permission_id=perm.id)
                    db.add(rp)

    await db.flush()

    print("\nUsers:")
    users_data = [
        {
            "username": "admin",
            "email": "admin@cms.local",
            "full_name": "系统管理员",
            "password": "admin123",
            "roles": ["admin"],
            "avatar": "👨‍💼",
        },
        {
            "username": "editor",
            "email": "editor@cms.local",
            "full_name": "张编辑",
            "password": "editor123",
            "roles": ["editor"],
            "avatar": "✍️",
        },
        {
            "username": "translator_en",
            "email": "translator_en@cms.local",
            "full_name": "李翻译（英文）",
            "password": "trans123",
            "roles": ["translator"],
            "avatar": "🌐",
        },
        {
            "username": "translator_ja",
            "email": "translator_ja@cms.local",
            "full_name": "王翻译（日文）",
            "password": "trans123",
            "roles": ["translator"],
            "avatar": "🌸",
        },
        {
            "username": "reviewer",
            "email": "reviewer@cms.local",
            "full_name": "陈审校",
            "password": "review123",
            "roles": ["reviewer"],
            "avatar": "✅",
        },
    ]

    for ud in users_data:
        result = await db.execute(select(User).where(User.username == ud["username"]))
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                username=ud["username"],
                email=ud["email"],
                full_name=ud["full_name"],
                hashed_password=hash_password(ud["password"]),
                avatar=ud["avatar"],
                is_active=True,
                language_preference="zh",
            )
            user.roles = [created_roles[rname] for rname in ud["roles"]]
            db.add(user)
            print(f"  + Created user: {ud['username']} ({ud['full_name']}) - pwd: {ud['password']}")
        else:
            print(f"  User '{ud['username']}' already exists, skipping.")

    await db.flush()


async def seed_data():
    print("\n=== Seeding CMS Data ===")
    print("Checking existing data and inserting only if not present...\n")

    async with AsyncSessionLocal() as db:
        await seed_users_roles(db)

        print("\nContent Types:")
        article_type, _ = await get_or_create_content_type(db, "article", "文章", "网站文章内容，支持多语言")
        await create_fields_if_not_exists(db, article_type.id, [
            {"name": "title", "label": "标题", "field_type": "text", "is_required": True, "is_translatable": True, "sort_order": 1},
            {"name": "body", "label": "正文", "field_type": "richtext", "is_required": True, "is_translatable": True, "sort_order": 2},
            {"name": "summary", "label": "摘要", "field_type": "textarea", "is_required": False, "is_translatable": True, "sort_order": 3},
            {"name": "cover_image", "label": "封面图", "field_type": "image", "is_required": False, "is_translatable": False, "sort_order": 4},
            {"name": "status_type", "label": "状态标签", "field_type": "select", "is_required": False, "is_translatable": False, "sort_order": 5,
             "options": [{"label": "置顶", "value": "sticky"}, {"label": "精选", "value": "featured"}, {"label": "普通", "value": "normal"}]},
        ])

        product_type, _ = await get_or_create_content_type(db, "product", "产品", "产品展示内容")
        await create_fields_if_not_exists(db, product_type.id, [
            {"name": "name", "label": "产品名称", "field_type": "text", "is_required": True, "is_translatable": True, "sort_order": 1},
            {"name": "description", "label": "产品描述", "field_type": "richtext", "is_required": True, "is_translatable": True, "sort_order": 2},
            {"name": "price", "label": "价格", "field_type": "number", "is_required": True, "is_translatable": False, "sort_order": 3},
            {"name": "image", "label": "产品图片", "field_type": "image", "is_required": False, "is_translatable": False, "sort_order": 4},
            {"name": "category", "label": "分类", "field_type": "text", "is_required": False, "is_translatable": True, "sort_order": 5},
        ])

        page_type, _ = await get_or_create_content_type(db, "page", "页面", "静态页面内容")
        await create_fields_if_not_exists(db, page_type.id, [
            {"name": "title", "label": "页面标题", "field_type": "text", "is_required": True, "is_translatable": True, "sort_order": 1},
            {"name": "content", "label": "页面内容", "field_type": "richtext", "is_required": True, "is_translatable": True, "sort_order": 2},
            {"name": "meta_description", "label": "SEO描述", "field_type": "textarea", "is_required": False, "is_translatable": True, "sort_order": 3},
        ])

        # --- Content Entries ---
        print("\nContent Entries:")
        await get_or_create_entry_with_translations(db, article_type.id, "welcome-to-cms-zh", [
            {"language_code": "zh", "is_published": True, "title": "欢迎使用多语言CMS", "slug": "welcome-to-cms-zh",
             "field_values": {"title": "欢迎使用多语言CMS", "body": "<p>这是一个功能强大的多语言内容管理系统。</p><p>您可以自定义内容类型和字段，并管理多语言版本内容。</p>", "summary": "多语言CMS简介", "cover_image": "/images/welcome.jpg", "status_type": "featured"}},
            {"language_code": "en", "is_published": True, "title": "Welcome to MultiLingual CMS", "slug": "welcome-to-cms-en",
             "field_values": {"title": "Welcome to MultiLingual CMS", "body": "<p>This is a powerful multi-lingual content management system.</p><p>You can customize content types and fields, and manage multi-language versions of content.</p>", "summary": "Introduction to MultiLingual CMS", "cover_image": "/images/welcome.jpg", "status_type": "featured"}},
            {"language_code": "ja", "is_published": True, "title": "多言語CMSへようこそ", "slug": "welcome-to-cms-ja",
             "field_values": {"title": "多言語CMSへようこそ", "body": "<p>これは強力な多言語コンテンツ管理システムです。</p><p>コンテンツタイプとフィールドをカスタマイズし、コンテンツの多言語バージョンを管理できます。</p>", "summary": "多言語CMSの紹介", "cover_image": "/images/welcome.jpg", "status_type": "featured"}},
        ])

        await get_or_create_entry_with_translations(db, article_type.id, "create-content-type-zh", [
            {"language_code": "zh", "is_published": True, "title": "如何创建内容类型", "slug": "create-content-type-zh",
             "field_values": {"title": "如何创建内容类型", "body": "<p>在内容类型管理页面，点击\"新建\"按钮即可创建新的内容类型。</p>", "summary": "创建内容类型教程", "status_type": "normal"}},
            {"language_code": "en", "is_published": True, "title": "How to Create Content Types", "slug": "create-content-type-en",
             "field_values": {"title": "How to Create Content Types", "body": "<p>On the content types management page, click the \"New\" button to create a new content type.</p>", "summary": "Creating content types tutorial", "status_type": "normal"}},
        ])

        await get_or_create_entry_with_translations(db, product_type.id, "smart-watch-pro-zh", [
            {"language_code": "zh", "is_published": True, "title": "智能手表 Pro", "slug": "smart-watch-pro-zh",
             "field_values": {"name": "智能手表 Pro", "description": "<p>高端智能手表，支持心率监测、GPS定位、50米防水。</p>", "price": 1999, "image": "/images/smart-watch.jpg", "category": "电子设备"}},
            {"language_code": "en", "is_published": True, "title": "Smart Watch Pro", "slug": "smart-watch-pro-en",
             "field_values": {"name": "Smart Watch Pro", "description": "<p>Premium smartwatch with heart rate monitor, GPS, and 50m water resistance.</p>", "price": 1999, "image": "/images/smart-watch.jpg", "category": "Electronics"}},
        ])

        await get_or_create_entry_with_translations(db, page_type.id, "about-us-zh", [
            {"language_code": "zh", "is_published": True, "title": "关于我们", "slug": "about-us-zh",
             "field_values": {"title": "关于我们", "content": "<h1>关于我们</h1><p>我们是一家专注于多语言内容管理解决方案的技术公司。</p>", "meta_description": "关于多语言CMS团队的介绍"}},
            {"language_code": "en", "is_published": True, "title": "About Us", "slug": "about-us-en",
             "field_values": {"title": "About Us", "content": "<h1>About Us</h1><p>We are a technology company focused on multi-lingual content management solutions.</p>", "meta_description": "Introduction to the MultiLingual CMS team"}},
        ])

        await db.commit()
        print("\n=== Seed completed successfully! ===")


if __name__ == "__main__":
    asyncio.run(seed_data())
