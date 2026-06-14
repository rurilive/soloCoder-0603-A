# 代理池管理系统设计文档

**日期**: 2026-06-15  
**主题**: 代理池管理、动态代理切换、代理有效性检测、请求频率限制、随机延迟

---

## 1. 背景与目标

爬虫在频繁请求目标网站时，经常遭遇 IP 封禁，导致爬取任务中断、效率低下。本系统旨在提供完整的代理池管理能力，支持动态代理 IP 切换、代理有效性自动检测、请求频率限制和随机延迟功能，降低被封禁风险，提高爬取成功率。

### 核心目标

- 统一管理代理 IP（增删改查、批量导入）
- 自动定时检测代理有效性，剔除无效代理
- 爬虫请求时自动选择可用代理并在失败时动态切换
- 支持请求频率限制（令牌桶算法）
- 支持随机请求延迟（min~max 区间随机）
- 提供可视化代理池管理前端界面

---

## 2. 技术方案选择

采用**方案 A：轻量级代理池**（推荐）

代理池作为后端服务模块，通过 FastAPI API 管理，在爬虫执行器代码包装器中集成代理选择、频率限制、随机延迟逻辑。

### 选择理由

- 与现有架构融合度高，无需额外部署服务
- 实现成本低、维护成本低
- 满足所有需求场景
- 支持 HTTP/HTTPS/SOCKS5 三种协议

---

## 3. 数据模型设计

### 3.1 新增表

#### 表：proxies（代理IP表）

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| id | Integer, PK | 主键 | - |
| ip | String(64) | 代理IP地址 | - |
| port | Integer | 端口号 | - |
| protocol | String(20) | 协议: http/https/socks5 | "http" |
| username | String(255) | 认证用户名（可空） | NULL |
| password | String(255) | 认证密码（可空） | NULL |
| status | String(20) | 状态: active/inactive/checking/failed | "inactive" |
| success_count | Integer | 成功请求次数 | 0 |
| fail_count | Integer | 失败请求次数 | 0 |
| last_check_at | DateTime | 上次检测时间 | NULL |
| last_used_at | DateTime | 上次使用时间 | NULL |
| response_time | Integer | 平均响应时间(ms) | 0 |
| tags | JSON | 标签数组（用于分组筛选） | [] |
| remark | Text | 备注 | "" |
| created_at | DateTime | 创建时间 | utcnow |
| updated_at | DateTime | 更新时间 | utcnow |

#### 表：proxy_check_logs（代理检测日志表）

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| id | Integer, PK | 主键 | - |
| proxy_id | Integer, FK | 关联代理ID | - |
| success | Boolean | 是否检测成功 | - |
| response_time | Integer | 响应时间(ms) | 0 |
| status_code | Integer | HTTP状态码 | NULL |
| error_message | Text | 错误信息 | "" |
| checked_at | DateTime | 检测时间 | utcnow |

### 3.2 修改表

#### 修改表：spider_tasks（新增字段）

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| proxy_enabled | Boolean | 是否启用代理 | False |
| proxy_tags | JSON | 使用的代理标签筛选（空=全部可用） | [] |
| proxy_rotation_strategy | String(50) | 切换策略: random/round_robin/by_response_time | "random" |
| rate_limit_enabled | Boolean | 是否启用频率限制 | True |
| rate_limit_per_minute | Integer | 每分钟最大请求数 | 60 |
| delay_min | Float | 最小延迟(秒) | 0.5 |
| delay_max | Float | 最大延迟(秒) | 2.0 |
| retry_on_proxy_fail | Integer | 代理失败重试次数 | 3 |

### 3.3 全局配置项（config.py）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| proxy_check_enabled | Boolean | True | 是否启用定时检测 |
| proxy_check_interval | Integer | 30 | 检测间隔（分钟） |
| proxy_check_url | String | "https://httpbin.org/ip" | 检测URL |
| proxy_check_timeout | Integer | 10 | 检测超时(秒) |
| default_proxy_rotation_strategy | String | "random" | 默认切换策略 |
| default_rate_limit_per_minute | Integer | 60 | 默认每分钟请求数 |
| default_delay_min | Float | 0.5 | 默认最小延迟(秒) |
| default_delay_max | Float | 2.0 | 默认最大延迟(秒) |

---

## 4. 后端设计

### 4.1 API 路由（routers/proxies.py）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/proxies | 分页代理列表（筛选：status/protocol/tags） |
| GET | /api/proxies/{id} | 单个代理详情 |
| POST | /api/proxies | 新增单个代理 |
| POST | /api/proxies/batch | 批量导入（文本格式） |
| PUT | /api/proxies/{id} | 更新代理 |
| DELETE | /api/proxies/{id} | 删除代理 |
| DELETE | /api/proxies/batch | 批量删除 |
| POST | /api/proxies/{id}/check | 立即检测单个代理 |
| POST | /api/proxies/batch-check | 批量检测代理 |
| GET | /api/proxies/stats | 代理池统计 |
| GET | /api/proxies/check-logs/{proxy_id} | 代理检测历史（分页） |
| GET | /api/proxies/settings | 获取全局配置 |
| PUT | /api/proxies/settings | 更新全局配置 |

### 4.2 核心服务（services/proxy_pool.py）

#### ProxyPoolService

```
- get_proxy(tags=None, strategy="random") -> Proxy or None
  按策略选择可用代理

- report_proxy_result(proxy_id, success, response_time=0)
  上报代理使用结果，更新成功率、状态

- check_proxy(proxy_id) -> dict
  同步检测单个代理，返回检测结果

- check_all_proxies(tags=None) -> dict
  批量检测代理，返回统计结果

- get_available_count(tags=None) -> int
  获取可用代理数量

- parse_proxy_string(text) -> list[dict]
  解析批量导入文本，返回代理配置列表
```

#### 策略说明

- **random**：从可用代理中随机选择
- **round_robin**：轮询选择（内存中维护轮询指针）
- **by_response_time**：按响应时间加权随机（响应越快概率越高）

### 4.3 执行器集成（executor.py）

在 `_wrap_code()` 注入增强逻辑：

1. **代理管理**
   - 启动时拉取符合条件的可用代理列表到本地
   - 初始化策略选择器
   - 失败时自动切换代理重试

2. **频率限制（令牌桶算法）**
   - 维护 `_tokens` 桶，每秒补充 rate/60 个
   - 请求前 `_acquire_token()` 阻塞等待

3. **随机延迟**
   - 每次请求前 `time.sleep(random.uniform(delay_min, delay_max))`

4. **增强辅助函数**
```python
get_current_proxy()        # 当前代理信息
rotate_proxy(reason="")   # 手动切换代理
report_proxy(...)       # 手动上报
has_available_proxies() # 是否还有可用代理
```

5. **requests monkeypatch**
   - 对 `requests.get/post/request` 自动注入代理配置
   - 确保用户直接调用 requests 也生效

### 4.4 定时任务（scheduler.py）

新增任务：`proxy_check_job`
- 每隔 `proxy_check_interval` 分钟执行一次
- 调用 `ProxyPoolService.check_all_proxies()`

---

## 5. 前端设计

### 5.1 新增页面：ProxyPool 代理池管理

**顶部工具栏**：
- 统计卡片（总数/可用/不可用/待检测）
- 操作按钮：新增代理、批量导入、批量检测、全局设置
- 筛选器：状态、协议、标签搜索

**代理列表表格**：
- 复选框、ID、IP:Port、协议Badge、状态Badge、成功率（进度条）、响应时间、使用次数、标签、上次检测、操作（检测/编辑/删除）

**弹窗组件**：
- 新增/编辑代理弹窗（IP、端口、协议、用户名、密码、标签、备注）
- 批量导入弹窗（大文本框 + 格式示例）
- 全局设置弹窗（定时检测开关/间隔/URL/超时、默认策略/频率/延迟）
- 代理详情抽屉（基本信息 + 检测历史表格）

### 5.2 修改页面：TaskEditor

新增分区：**代理与频率限制**

- 启用代理池（开关）
  - 代理标签筛选（多选Tag）
  - 代理切换策略（下拉）
  - 代理失败重试次数（数字）

- 启用频率限制（开关）
  - 每分钟最大请求数（数字）

- 随机延迟范围
  - 最小延迟、最大延迟（秒）

### 5.3 导航修改

在 Layout 侧边栏菜单新增「代理池」入口

---

## 6. 错误处理

| 场景 | 处理策略 |
|------|----------|
| 代理连接失败 | 立即标记该代理 failed，切换下一个重试 |
| 目标 403/429 | 切换代理重试，当前代理增加冷却 |
| 响应超时 | 切换代理重试，记录响应时间异常 |
| 代理池耗尽 | 记录警告，切换直连模式（可配置是否允许） |
| 频率令牌不足 | 阻塞等待令牌，超出时间则跳过 |
| 检测任务异常 | 记录错误日志，跳过本轮检测 |

---

## 7. 实现范围

本次实现包含所有上述设计。文件清单如下：

**后端**：
- backend/app/models.py — 新增 Proxy、ProxyCheckLog 模型，修改 SpiderTask
- backend/app/schemas.py — 新增 Proxy 相关 schema，修改 SpiderTask schema
- backend/app/config.py — 新增全局配置项
- backend/app/services/proxy_pool.py — 新增核心服务
- backend/app/routers/proxies.py — 新增 API 路由
- backend/app/services/executor.py — 集成代理、频率限制、随机延迟
- backend/app/services/scheduler.py — 新增定时检测任务
- backend/app/main.py — 注册 proxies router

**前端**：
- frontend/src/types/index.ts — 新增 Proxy 类型定义
- frontend/src/services/api.ts — 新增 proxies API 方法
- frontend/src/pages/ProxyPool.tsx — 新增代理池管理页面
- frontend/src/pages/TaskEditor.tsx — 新增代理与频率限制配置区
- frontend/src/components/Layout.tsx — 新增代理池导航入口
- frontend/src/App.tsx — 注册代理池路由
