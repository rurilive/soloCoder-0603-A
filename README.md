# 活动发布和报名系统

## 项目简介

本项目是一个活动发布和报名系统，主办方可以创建活动，设置报名表单，用户可以报名参加活动并获得电子票二维码，活动当天可以通过扫码签到。

## 技术栈

### 后端
- Python 3.12
- FastAPI
- SQLAlchemy (SQLite)
- UV (Python包管理器)
- qrcode (二维码生成)
- python-jose + passlib (身份认证)

### 前端
- React 18
- Vite
- TailwindCSS 3
- React Router
- Axios
- qrcode.react

## 项目结构

```
.
├── backend/                  # 后端代码
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI入口
│   │   ├── database.py       # 数据库配置
│   │   ├── models.py         # SQLAlchemy模型
│   │   ├── schemas.py        # Pydantic模式
│   │   ├── utils.py          # 工具函数
│   │   ├── dependencies.py   # 依赖注入
│   │   └── api/              # API路由
│   │       ├── users.py      # 用户相关API
│   │       ├── events.py     # 活动相关API
│   │       └── registrations.py  # 报名相关API
│   ├── run.py                # 启动脚本
│   └── uv.lock               # UV锁文件
├── frontend/                 # 前端代码
│   ├── src/
│   │   ├── api/              # API调用封装
│   │   ├── components/       # 通用组件
│   │   ├── context/          # React Context
│   │   ├── pages/            # 页面组件
│   │   ├── App.jsx           # 主应用组件
│   │   ├── main.jsx          # 入口文件
│   │   └── index.css         # 全局样式
│   ├── vite.config.js        # Vite配置
│   └── package.json          # 前端依赖
└── .gitignore               # Git忽略文件
```

## 功能特性

### 用户功能
- 用户注册/登录
- 查看活动列表
- 查看活动详情
- 报名参加活动
- 查看我的活动（包含电子票和二维码）

### 主办方功能
- 注册时设置为主办方身份
- 创建活动（支持拖拽生成报名表单）
- 编辑/删除活动

### 签到功能
- 输入票码进行签到
- 签到状态管理

### 报名表单字段类型
- 单行文本
- 邮箱
- 手机号
- 多行文本
- 下拉选择
- 复选框

## 快速开始

### 环境要求
- Python 3.12+
- Node.js 18+
- UV (Python包管理器)

### 后端启动

```bash
cd backend
uv install
uv run python run.py
```

后端服务将在 `http://localhost:1111` 启动。

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:1112` 启动。

## API接口文档

### 用户接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/users/register` | 用户注册 |
| POST | `/users/login` | 用户登录 |

### 活动接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/events` | 获取活动列表 |
| GET | `/events/{id}` | 获取活动详情 |
| POST | `/events` | 创建活动（需主办方权限） |
| PUT | `/events/{id}` | 更新活动（需主办方权限） |
| DELETE | `/events/{id}` | 删除活动（需主办方权限） |

### 报名接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/registrations` | 获取当前用户报名记录 |
| POST | `/registrations` | 报名参加活动 |
| GET | `/registrations/{id}/qr-code` | 获取电子票二维码 |
| POST | `/registrations/checkin` | 签到 |
| GET | `/registrations/event/{event_id}` | 获取活动所有报名记录 |

## 数据库模型

### User (用户)
- id: int (主键)
- username: str (用户名)
- email: str (邮箱)
- hashed_password: str (加密密码)
- is_organizer: bool (是否主办方)
- created_at: datetime (创建时间)

### Event (活动)
- id: int (主键)
- title: str (活动标题)
- description: str (活动描述)
- start_time: datetime (开始时间)
- end_time: datetime (结束时间)
- location: str (活动地点)
- max_capacity: int (最大名额)
- registration_form: JSON (报名表单配置)
- status: str (状态)
- organizer_id: int (主办方ID)
- created_at: datetime (创建时间)
- updated_at: datetime (更新时间)

### Registration (报名)
- id: int (主键)
- user_id: int (用户ID)
- event_id: int (活动ID)
- ticket_code: str (票码)
- check_in: bool (是否签到)
- check_in_time: datetime (签到时间)
- form_data: JSON (表单数据)
- created_at: datetime (创建时间)

## 配置说明

### 后端配置

后端使用SQLite数据库，数据库文件为 `event.db`，位于后端目录下。

JWT密钥配置在 `app/utils.py` 中：
- SECRET_KEY: JWT签名密钥
- ALGORITHM: HS256
- ACCESS_TOKEN_EXPIRE_MINUTES: 30分钟

### 前端配置

前端代理配置在 `vite.config.js` 中，将 `/api` 路径代理到后端服务。

## 使用说明

### 1. 注册用户

访问 `http://localhost:1112/register` 注册账号，可选择是否作为主办方。

### 2. 创建活动（主办方）

登录后访问 `http://localhost:1112/create-event` 创建活动，支持拖拽添加报名表单字段。

### 3. 报名参加活动

访问活动列表页面，点击活动卡片进入详情页，填写表单并提交报名。

### 4. 查看电子票

登录后访问 `http://localhost:1112/my-events` 查看已报名的活动和电子票二维码。

### 5. 签到

访问 `http://localhost:1112/checkin`，输入票码进行签到。

## 开发说明

### 添加新的表单字段类型

在前端 `CreateEvent.jsx` 的 `availableFields` 数组中添加新字段类型，并在 `EventDetail.jsx` 的 `renderFormField` 函数中添加对应的渲染逻辑。

### 添加新的API接口

在后端 `app/api/` 目录下创建新的路由文件，然后在 `app/main.py` 中注册路由。

## 注意事项

1. 生产环境请修改 `SECRET_KEY` 为安全的随机字符串
2. 生产环境建议使用 PostgreSQL 或 MySQL 替代 SQLite
3. 建议添加 HTTPS 支持
4. 建议添加日志记录功能

## License

MIT License