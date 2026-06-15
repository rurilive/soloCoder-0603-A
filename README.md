# 内容审核系统

一个完整的内容审核系统，支持自动审核和人工审核流程。

## 功能特性

- 📝 **内容提交**：支持标题、正文、作者、来源等字段
- 🤖 **自动审核**：基于规则引擎，支持关键词、正则、长度规则
- ⚖️ **风险评分**：每条规则有分值，总分决定审核结果
  - 风险分 ≤ -5：自动通过
  - 风险分 ≥ 5：自动拒绝
  - 其他情况：进入人工审核队列
- 👥 **人工审核**：审核员可查看、通过、拒绝、打标签
- 🔔 **实时通知**：WebSocket实时推送审核状态更新
- 📊 **数据统计**：查看审核数据概览和分布
- ⚙️ **规则管理**：可配置、启用/禁用、编辑审核规则

## 技术栈

**后端**
- Python 3.8+
- FastAPI (API框架)
- SQLAlchemy (ORM)
- SQLite (数据库)
- WebSocket (实时推送)

**前端**
- React 18
- Ant Design (UI组件库)
- Vite (构建工具)
- React Router (路由)
- Axios (HTTP客户端)

## 快速启动

### 方式一：一键启动

```bash
chmod +x start.sh
./start.sh
```

### 方式二：手动启动

**启动后端 (端口 1111)**
```bash
cd backend
pip install -r requirements.txt
python main.py
```

**启动前端 (端口 1112)**
```bash
cd frontend
npm install
npm run dev
```

## 访问地址

- 前端界面: http://localhost:1112
- 后端API: http://localhost:1111
- API文档: http://localhost:1111/docs

## 项目结构

```
.
├── backend/
│   ├── main.py              # 主应用入口
│   ├── database.py          # 数据库配置
│   ├── models.py            # 数据模型
│   ├── schemas.py           # Pydantic模式
│   ├── auto_moderation.py   # 自动审核引擎
│   ├── websocket_manager.py # WebSocket管理
│   ├── requirements.txt     # 依赖列表
│   └── moderation.db        # SQLite数据库(运行后生成)
├── frontend/
│   ├── src/
│   │   ├── pages/           # 页面组件
│   │   │   ├── DashboardPage.jsx   # 数据概览
│   │   │   ├── QueuePage.jsx       # 待审队列
│   │   │   ├── ApprovedPage.jsx    # 已通过
│   │   │   ├── RejectedPage.jsx    # 已拒绝
│   │   │   ├── SubmitPage.jsx      # 提交内容
│   │   │   └── RulesPage.jsx       # 规则管理
│   │   ├── components/
│   │   │   └── ContentDetail.jsx   # 内容详情
│   │   ├── services/
│   │   │   └── api.js              # API封装
│   │   ├── App.jsx                 # 主应用
│   │   └── main.jsx                # 入口文件
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
└── start.sh                 # 一键启动脚本
```

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/contents` | 提交内容 |
| GET | `/api/contents` | 获取内容列表 |
| GET | `/api/contents/{id}` | 获取内容详情 |
| POST | `/api/contents/{id}/review` | 审核内容 |
| GET | `/api/contents/{id}/logs` | 获取审核日志 |
| GET | `/api/stats` | 获取统计数据 |
| GET | `/api/rules` | 获取规则列表 |
| POST | `/api/rules` | 创建规则 |
| PUT | `/api/rules/{id}` | 更新规则 |
| DELETE | `/api/rules/{id}` | 删除规则 |
| GET | `/api/health` | 健康检查 |
| WS | `/ws` | WebSocket连接 |

## 默认审核规则

系统启动时会自动创建以下默认规则：

| 规则名称 | 类型 | 动作 | 分值 |
|---------|------|------|------|
| 敏感词-广告 | 关键词 | 拒绝 | +10 |
| 敏感词-违规 | 关键词 | 拒绝 | +15 |
| 内容过短 | 最小长度 | 人工 | +3 |
| 优质内容-长度足够 | 最大长度 | 通过 | -3 |
| 安全词-正常词汇 | 关键词 | 通过 | -2 |

## 审核流程

```
内容提交
    ↓
自动审核引擎
    ├─ 匹配所有启用的规则
    ├─ 计算风险总分
    ├─ 风险分 ≤ -5 → 自动通过 (发布)
    ├─ 风险分 ≥ 5  → 自动拒绝
    └─ 其他情况 → 进入人工审核队列
                                                          
人工审核队列
    ├─ 审核员查看内容详情
    ├─ 查看自动审核原因
    ├─ 执行操作：通过 / 拒绝 / 打标签
    └─ 记录审核日志
```

## 停止服务

按下 `Ctrl+C` 停止所有服务，或使用以下命令：

```bash
pkill -f "python main.py"
pkill -f "vite"
```
