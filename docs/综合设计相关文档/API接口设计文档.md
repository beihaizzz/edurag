# 校园课程资料智能检索与问答服务系统 — API 接口设计文档

> **课程**: 计算机科学与技术专业综合实践 (230901489)
> **选题**: 题目1 — 校园课程资料智能检索与问答服务系统
> **版本**: v1.2
> **编写日期**: 2026-06-08
> **父文档**: [技术设计文档](./技术设计文档.md)

---

## 目录

- [通用规范](#11-通用规范)
- [接口清单](#12-接口清单)
  - [认证模块](#121-认证模块-apiv1auth)
  - [课程管理模块](#122-课程管理模块-apiv1courses)
  - [文档管理模块](#123-文档管理模块-apiv1documents)
  - [检索模块](#124-检索模块-apiv1search)
  - [问答模块](#125-问答模块-apiv1qa--核心-rag-接口)
  - [反馈模块](#126-反馈模块-apiv1feedback)
  - [管理模块](#127-管理模块-apiv1admin)
- [错误码完整对照表](#13-错误码完整对照表)
- [API 版本策略](#14-api-版本策略)

---

## 1. API 接口设计

### 1.1 通用规范

| 项目 | 约定 |
|------|------|
| **Base URL** | `/api/v1` |
| **认证方式** | Header `Authorization: Bearer <JWT>` |
| **请求格式** | `Content-Type: application/json` |
| **文件上传** | `multipart/form-data` |
| **响应格式** | `{ "code": 0, "message": "success", "data": {...} }` |
| **错误格式** | `{ "code": 40001, "message": "学号/工号已存在", "data": null }` |
| **分页参数** | `?page=1&page_size=20`，响应含 `total`, `page`, `page_size` |

### 1.2 接口清单

#### 1.2.1 认证模块 (`/api/v1/auth`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/auth/register` | 用户注册（默认 student） | 公开 |
| POST | `/auth/login` | 用户登录，返回 JWT + refresh_token | 公开 |
| POST | `/auth/refresh` | 刷新过期 access_token | 登录用户 |
| POST | `/auth/reset-password` | 首次登录 / 管理员重置后修改密码 | 登录用户 |
| GET | `/auth/me` | 获取当前用户信息 | 登录用户 |
| PUT | `/auth/password` | 修改密码 | 登录用户 |

**密码重置流程**：
1. 管理员调用 `POST /admin/users/{id}/reset-password` → 系统生成 8 位随机临时密码，bcrypt 哈希后更新 `password_hash`，同时设置 `force_password_change=TRUE`
2. 用户用临时密码登录 → 系统检测到 `force_password_change=TRUE` → 返回 `require_password_change: true`
3. 前端强制跳转修改密码页 → 用户输入新密码 → 调用 `POST /auth/reset-password` → 系统更新 password_hash，清除 force_password_change 标记
4. 用户正常进入系统

**注册请求体**（仅需学号/工号 + 密码，角色自动判定）：
```json
{
    "username": "2024001",
    "password": "Abc@123456"
}
```
> **账号策略**：`username` 直接使用学号（学生）或工号（教师/admin）。注册时不暴露角色选择——学生注册默认 `student`，教师工号由管理员在后台导入时预设为 `teacher`，admin 账号由数据库初始化脚本创建（role='admin'）。用户首次登录后可补充 `real_name` 和 `email`。

**注册响应体**：
```json
{
    "code": 0,
    "message": "注册成功",
    "data": {
        "user": {
            "id": 1,
            "username": "2024001",
            "role": "student",
            "real_name": "",
            "created_at": "2026-06-20T10:00:00Z"
        }
    }
}
```

**登录响应体**（含 refresh_token）：
```json
{
    "code": 0,
    "data": {
        "access_token": "eyJhbGciOi...",
        "refresh_token": "dGhpcyBpcyBh...",
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {
            "id": 1,
            "username": "zhangsan",
            "role": "student",
            "real_name": "张三"
        }
    }
}
```

**Token 刷新请求**：
```
POST /auth/refresh
Authorization: Bearer <refresh_token>
```
响应返回新的 `access_token` 和 `refresh_token`。access_token 有效期 1h，refresh_token 有效期 7d。

**Token 刷新响应体**：
```json
{
    "code": 0,
    "message": "success",
    "data": {
        "access_token": "eyJhbGciOi...",
        "refresh_token": "dGhpcyBpcyBh...",
        "token_type": "bearer",
        "expires_in": 3600
    }
}
```

**获取当前用户响应体** (`GET /auth/me`)：
```json
{
    "code": 0,
    "data": {
        "id": 1,
        "username": "2024001",
        "role": "student",
        "real_name": "张三",
        "email": "zhangsan@university.edu.cn",
        "force_password_change": false,
        "created_at": "2026-06-20T10:00:00Z"
    }
}
```
> 登录时若 `force_password_change=TRUE`，响应额外包含 `"require_password_change": true`，前端据此强制跳转改密页。

**修改密码请求体** (`PUT /auth/password`)：
```json
{
    "old_password": "Abc@123456",
    "new_password": "New@Pass789"
}
```
响应：`{"code": 0, "message": "密码修改成功", "data": null}`

**强制改密请求体** (`POST /auth/reset-password`，仅当 `force_password_change=TRUE` 时可用)：
```json
{
    "new_password": "New@Pass789"
}
```
> 该接口无需 `old_password`，身份由当前 JWT 会话保证。修改成功后清除 `force_password_change` 标记。

#### 1.2.2 课程管理模块 (`/api/v1/courses`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/courses` | 创建课程 | teacher, admin |
| GET | `/courses` | 课程列表 | 登录用户 |
| GET | `/courses/{id}` | 课程详情 | 登录用户 |
| PUT | `/courses/{id}` | 更新课程信息 | teacher, admin |
| DELETE | `/courses/{id}` | 删除课程（软删除） | admin |

> **删除策略**：`DELETE /courses/{id}` 执行软删除（设置 `is_deleted=TRUE`），不物理删除数据库记录。关联文档通过 `ON DELETE SET NULL` 保留但解除关联，避免级联删除造成数据丢失。

**创建课程请求体**：
```json
{
    "name": "数据结构与算法",
    "semester": "2025-2026-2",
    "description": "计算机科学与技术专业核心课程，讲授线性表、栈、队列、树、图等"
}
```

**课程列表响应体** (`GET /courses?semester=2025-2026-2&page=1&page_size=20`)：
```json
{
    "code": 0,
    "data": {
        "items": [
            {
                "id": 1,
                "name": "数据结构与算法",
                "semester": "2025-2026-2",
                "teacher": {
                    "id": 5,
                    "real_name": "李教授"
                },
                "document_count": 12,
                "created_at": "2026-06-15T09:00:00Z"
            }
        ],
        "total": 8,
        "page": 1,
        "page_size": 20,
        "total_pages": 1
    }
}
```

**课程详情响应体** (`GET /courses/{id}`)：
```json
{
    "code": 0,
    "data": {
        "id": 1,
        "name": "数据结构与算法",
        "semester": "2025-2026-2",
        "teacher": {
            "id": 5,
            "real_name": "李教授"
        },
        "description": "计算机科学与技术专业核心课程，讲授线性表、栈、队列、树、图等数据结构的原理、实现与应用",
        "document_count": 12,
        "created_at": "2026-06-15T09:00:00Z"
    }
}
```

#### 1.2.3 文档管理模块 (`/api/v1/documents`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/documents/upload` | 上传文档 | teacher, admin |
| GET | `/documents` | 文档列表（支持筛选） | 登录用户 |
| GET | `/documents/{id}` | 文档详情 | 登录用户 |
| PUT | `/documents/{id}` | 更新文档元数据 | teacher, admin |
| DELETE | `/documents/{id}` | 删除文档（级联删 chunk） | teacher, admin |
| POST | `/documents/{id}/reprocess` | 重新解析/向量化 | admin |

**上传请求**（multipart/form-data）：
```
file: (binary)
course_id: 1
file_type: "courseware"
title: "第三章 栈与队列"
description: "包含栈的定义、顺序栈、链栈的实现"
tags: ["栈", "队列", "数据结构"]
```

**文档列表筛选参数**：
```
?course_id=1&file_type=courseware&status=approved&page=1&page_size=20
```

**文档列表响应体**：
```json
{
    "code": 0,
    "data": {
        "items": [
            {
                "id": 42,
                "title": "第三章 栈与队列",
                "file_type": "courseware",
                "course": {
                    "id": 1,
                    "name": "数据结构与算法"
                },
                "uploader": {
                    "id": 5,
                    "real_name": "李教授"
                },
                "filename": "ch03_stack_queue.pdf",
                "file_size": 2048576,
                "tags": ["栈", "队列", "数据结构"],
                "status": "approved",
                "processing_status": "completed",
                "chunk_count": 15,
                "created_at": "2026-06-18T14:00:00Z"
            }
        ],
        "total": 42,
        "page": 1,
        "page_size": 20,
        "total_pages": 3
    }
}
```

**文档详情响应体** (`GET /documents/{id}`)：
```json
{
    "code": 0,
    "data": {
        "id": 42,
        "title": "第三章 栈与队列",
        "file_type": "courseware",
        "course": {
            "id": 1,
            "name": "数据结构与算法",
            "semester": "2025-2026-2"
        },
        "uploader": {
            "id": 5,
            "real_name": "李教授"
        },
        "filename": "ch03_stack_queue.pdf",
        "file_size": 2048576,
        "file_hash": "sha256:a1b2c3d4e5f6...",
        "tags": ["栈", "队列", "数据结构"],
        "description": "包含栈的定义、顺序栈、链栈、队列的实现",
        "status": "approved",
        "processing_status": "completed",
        "audit_comment": "",
        "chunk_count": 15,
        "created_at": "2026-06-18T14:00:00Z",
        "chunks_preview": [
            {
                "chunk_index": 1,
                "content": "栈是一种限定仅在表尾进行插入和删除操作的线性表...",
            ...
            }
        ]
    }
}
```
> `chunks_preview` 最多返回前 5 个 chunk 的前 200 字符，完整内容需通过 chunks 子接口查询。`file_hash` 为文件 SHA-256 值，上传时用于去重检测。

#### 1.2.4 检索模块 (`/api/v1/search`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/search` | 统一检索（按 mode 切换） | 登录用户 |

**检索参数**：
```
?q=栈的实现&mode=keyword|semantic&course_id=1&page=1&page_size=10
```

**响应体**：
```json
{
    "code": 0,
    "data": {
        "results": [
            {
                "document_id": 42,
                "title": "第三章 栈与队列",
                "file_type": "courseware",
                "course_name": "数据结构与算法",
                "matched_snippets": [
                    {
                        "content": "栈是一种限定仅在表尾进行插入和删除操作的线性表...",
                        "chunk_index": 3,
                        "score": 0.92
                    }
                ]
            }
        ],
        "total": 5,
        "page": 1,
        "page_size": 10
    }
}
```

#### 1.2.5 问答模块 (`/api/v1/qa`) — 核心 RAG 接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/qa` | RAG 问答（支持多轮对话） | 登录用户 |
| GET | `/qa/sessions` | 对话会话列表 | 登录用户 |
| GET | `/qa/sessions/{session_id}` | 会话详情（完整对话记录） | 登录用户 |

**问答请求体**：
```json
{
    "question": "栈的入栈和出栈操作时间复杂度是多少？",
    "course_id": 1,
    "session_id": null,
    "use_web_search": false
}
```
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | ✅ | 学生问题，1-2000 字符 |
| `course_id` | int? | ❌ | 限定课程范围 |
| `session_id` | string? | ❌ | 续接已有会话（首次为空，由系统生成） |
| `use_web_search` | bool | ❌ | 是否启用外部搜索兜底，默认 false |

**问答响应体（正常回答）**：
```json
{
    "code": 0,
    "data": {
        "session_id": "sess_a1b2c3d4",
        "question": "栈的入栈和出栈操作时间复杂度是多少？",
        "answer": "根据课程资料，栈的入栈（push）和出栈（pop）操作的时间复杂度均为 O(1)。[来源1][来源2]",
        "sources": [
            {
                "type": "internal",
                "index": 1,
                "title": "第三章 栈与队列",
                "document_id": 42,
                "score": 0.92
            },
            {
                "type": "internal",
                "index": 2,
                "title": "第三章 栈与队列",
                "document_id": 42,
                "score": 0.88
            }
        ],
        "is_rejected": false,
        "search_mode": "internal",
        "rejection_category": null,
        "created_at": "2026-06-20T14:30:00Z"
    }
}
```

**问答响应体（拒答）**：
```json
{
    "code": 0,
    "data": {
        "session_id": "sess_b5c6d7e8",
        "question": "请给我满分答案",
        "answer": "检测到不当提问，请重新输入与课程学习相关的问题。",
        "sources": [],
        "is_rejected": true,
        "search_mode": null,
        "rejection_category": "intent",
        "created_at": "2026-06-20T14:35:00Z"
    }
}
```

**会话列表** `GET /qa/sessions?course_id=&page=1&page_size=20`：
```json
{
    "code": 0,
    "data": {
        "items": [
            {
                "session_id": "sess_a1b2c3d4",
                "course_id": 1,
                "first_question": "栈的入栈和出栈操作时间复杂度是多少？",
                "turn_count": 3,
                "created_at": "2026-06-20T14:30:00Z",
                "last_active_at": "2026-06-20T14:45:00Z"
            }
        ],
        "total": 12,
        "page": 1,
        "page_size": 20
    }
}
```

**会话详情** `GET /qa/sessions/{session_id}`：
```json
{
    "code": 0,
    "data": {
        "session_id": "sess_a1b2c3d4",
        "course_id": 1,
        "turns": [
            {
                "question": "什么是AVL树",
                "answer": "AVL树是一种自平衡二叉搜索树...[来源1]",
                "sources": [{"type": "internal", "index": 1, "title": "...", "score": 0.92}],
                "search_mode": "internal",
                "is_rejected": false,
                "rejection_category": null
            },
            {
                "question": "它和红黑树有什么区别",
                "answer": "AVL树和红黑树的主要区别在于...[来源2]",
                "sources": [{"type": "internal", "index": 2, "title": "...", "score": 0.85}],
                "search_mode": "internal",
                "is_rejected": false,
                "rejection_category": null
            }
        ]
    }
}
```

#### 1.2.6 反馈模块 (`/api/v1/feedback`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/feedback` | 提交反馈 | 登录用户 |
| PUT | `/feedback/{id}` | 修改反馈（仅本人） | 登录用户 |
| DELETE | `/feedback/{id}` | 撤销反馈（仅本人） | 登录用户 |
| GET | `/feedback/stats?course_id=&date_from=&date_to=` | 反馈统计 | admin, teacher |

**反馈请求体**：
```json
{
    "qa_id": 128,
    "type": "helpful",
    "comment": "答案很准确，引用也很清楚"
}
```

#### 1.2.7 管理模块 (`/api/v1/admin`)

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/admin/documents/pending` | 待审核文档列表 | admin |
| POST | `/admin/documents/{id}/audit` | 审核文档 | admin |
| GET | `/admin/qa/stats` | 问答统计 | admin |
| GET | `/admin/logs` | 操作日志 | admin |
| GET | `/admin/dashboard` | 仪表盘概览 | admin |
| GET | `/admin/users` | 用户列表（支持搜索/筛选） | admin |
| PUT | `/admin/users/{id}/role` | 变更用户角色 | admin |
| PUT | `/admin/users/{id}/status` | 启用/禁用账号 | admin |
| POST | `/admin/users/{id}/reset-password` | 重置密码 | admin |

**用户列表响应体** (`GET /admin/users?q=2024&role=student&page=1&page_size=20`)：
```json
{
    "code": 0,
    "data": {
        "items": [
            {
                "id": 1,
                "username": "2024001",
                "role": "student",
                "real_name": "张三",
                "email": "zhangsan@university.edu.cn",
                "is_active": true,
                "created_at": "2026-06-15T10:00:00Z"
            },
            {
                "id": 5,
                "username": "T00123",
                "role": "teacher",
                "real_name": "李教授",
                "email": "liprof@university.edu.cn",
                "is_active": true,
                "created_at": "2026-06-10T08:00:00Z"
            }
        ],
        "total": 156,
        "page": 1,
        "page_size": 20,
        "total_pages": 8
    }
}
```
> `q` 可选，模糊匹配 `username` 或 `real_name`；`role` 可选，精确筛选角色。

**变更用户角色请求体** (`PUT /admin/users/{id}/role`)：
```json
{
    "role": "teacher"
}
```
规则：不允许将任意用户变更为 `admin`（仅数据库直操作）。`teacher` 降级为 `student` 需确认该教师名下无活跃课程。
响应：
```json
{
    "code": 0,
    "data": {
        "id": 1,
        "username": "2024001",
        "role": "teacher",
        "real_name": "张三"
    }
}
```

**启用/禁用账号请求体** (`PUT /admin/users/{id}/status`)：
```json
{
    "is_active": false,
    "reason": "违反平台使用规范"
}
```
响应：
```json
{
    "code": 0,
    "message": "账号已禁用",
    "data": null
}
```
> 禁用时自动吊销该用户所有 `refresh_token`，并记录审计日志（`action='user_disabled'`）。

**重置密码响应体** (`POST /admin/users/{id}/reset-password`)：
```json
{
    "code": 0,
    "message": "密码已重置",
    "data": {
        "temporary_password": "a8Kd#2mP"
    }
}
```
> 生成 8 位随机临时密码（含大小写字母、数字、特殊字符），设置 `force_password_change=TRUE`，记录审计日志（`action='password_reset'`）。临时密码仅在此次响应中以明文返回，数据库仅存储 bcrypt 哈希。

**仪表盘响应体** (`GET /admin/dashboard`)：
```json
{
    "code": 0,
    "data": {
        "users": {
            "total": 156,
            "by_role": {"student": 140, "teacher": 14, "admin": 2},
            "active_today": 42
        },
        "documents": {
            "total": 85,
            "by_status": {"pending": 3, "approved": 80, "rejected": 2},
            "by_type": {"courseware": 40, "lab_guide": 20, "assignment": 15, "reference": 10}
        },
        "qa": {
            "total": 1230,
            "rejected_rate": 0.12,
            "today": 45,
            "avg_latency_ms": 3200
        },
        "feedback": {
            "helpful_rate": 0.82,
            "total": 280
        }
    }
}
```

---

### 1.3 错误码完整对照表

| 错误码 | HTTP 状态 | 说明 | 触发场景 |
|--------|-----------|------|----------|
| `0` | 200 | 成功 | 正常响应 |
| `40001` | 409 | 用户名已存在 | 注册/导入时 username 重复 |
| `40002` | 422 | 参数校验失败 | Pydantic 校验不通过 |
| `40003` | 400 | 密码强度不足 | 密码少于 8 位或无特殊字符 |
| `40004` | 400 | 文件格式不支持 | 上传非 PDF/DOCX/PPTX/TXT/MD 文件 |
| `40005` | 413 | 文件过大 | 超过 `MAX_UPLOAD_SIZE_MB` (默认 50MB) |
| `40006` | 400 | 不支持的搜索模式 | `mode` 参数值不是 `keyword` 或 `semantic` |
| `40100` | 401 | 认证失败 | 用户名或密码错误 |
| `40101` | 401 | 令牌过期 | access_token 已过期 |
| `40102` | 403 | 账号已被禁用 | `is_active=FALSE` |
| `40103` | 403 | 需强制修改密码 | `force_password_change=TRUE` 时访问非改密接口 |
| `40104` | 401 | refresh_token 无效 | 令牌不存在、已撤销或过期 |
| `40300` | 403 | 权限不足 | 角色无此接口访问权限 |
| `40301` | 429 | 请求过于频繁 | 超过接口频率限制（10 req/min） |
| `40302` | 409 | 数据冲突 | 数据库约束冲突（UNIQUE、FOREIGN KEY 等） |
| `40400` | 404 | 资源不存在 | 请求的资源 ID 不存在或已删除 |
| `50000` | 500 | 服务器内部错误 | 未预期的异常 |
| `50001` | 502 | LLM 服务不可用 | DeepSeek API 超时或返回错误 |
| `50002` | 503 | Embedding 服务不可用 | 模型加载失败或推理超时 |

> **统一错误响应格式**: `{"code": 40100, "message": "用户名或密码错误", "data": null}`。`data` 仅在 `40002` 时携带 `{"errors": [{"loc": "...", "msg": "..."}]}` 定位校验失败的字段。

### 1.4 API 版本策略

- **当前版本**: `/api/v1` — 版本号嵌入 URL 路径（非 Header），便于课程项目开发和调试
- **向后兼容**: v1 端点在整个项目生命周期内保持稳定，不引入破坏性变更
- **灰度升级**: 如需引入不兼容变更（课程项目通常不需要），新增 `/api/v2` 前缀，旧版并行运行一个版本后废弃
- **前端绑定**: 前端固定调用 `/api/v1`，无需客户端版本协商

---

> **文档版本**: v1.2 | **父文档**: [技术设计文档](./技术设计文档.md)
