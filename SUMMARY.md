# Universal DNS Hub - 项目概览

## 📌 快速问答

### Q1: 这个项目使用什么技术栈？

**前端**：
- Next.js 16 (App Router) - React 框架
- React 19 - UI 库
- TypeScript 5 - 类型安全
- Tailwind CSS 4 - 样式框架
- shadcn/ui - UI 组件库

**后端**：
- Next.js API Routes - RESTful API
- PostgreSQL 15+ - 数据库
- Drizzle ORM - 数据库 ORM
- coze-coding-dev-sdk - AI 和数据库 SDK

**安全**：
- AES-256-GCM - 数据加密

---

### Q2: 如何部署到 Docker？

#### 方式 1: 使用 Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd universal-dns-hub

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置加密密钥
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f app
```

#### 方式 2: 使用 Dockerfile

```bash
# 1. 构建镜像
docker build -t universal-dns-hub .

# 2. 运行容器
docker run -d \
  -p 5000:5000 \
  -e DATABASE_URL=postgresql://user:password@host:5432/db \
  -e ENCRYPTION_KEY=your-32-byte-key \
  universal-dns-hub
```

详细步骤请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

---

### Q3: 如何部署到云平台？

#### Vercel（推荐 Next.js 项目）

1. 访问 [Vercel](https://vercel.com)
2. 导入 GitHub 仓库
3. 配置环境变量（DATABASE_URL, ENCRYPTION_KEY）
4. 点击 Deploy

#### Railway

1. 访问 [Railway](https://railway.app)
2. 创建新项目
3. 连接 GitHub 仓库
4. Railway 会自动添加 PostgreSQL 服务

#### Render

1. 访问 [Render](https://render.com)
2. 创建 Web Service
3. 设置构建命令：`pnpm install && pnpm build`
4. 设置启动命令：`pnpm start`

详细步骤请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

---

### Q4: 如何提交到 GitHub？

#### 第一步：初始化 Git 仓库

```bash
cd /workspace/projects

# 初始化仓库
git init

# 查看状态
git status
```

#### 第二步：配置用户信息

```bash
# 设置用户名
git config --global user.name "Your Name"

# 设置邮箱
git config --global user.email "your.email@example.com"
```

#### 第三步：添加文件并提交

```bash
# 添加所有文件
git add .

# 提交更改
git commit -m "feat: initial commit - Universal DNS Hub

- Add Next.js 16 + React 19 project
- Integrate Cloudflare, Aliyun, Tencent DNS providers
- Implement AI intelligent scheduling center
- Add Docker deployment configuration"
```

#### 第四步：在 GitHub 创建仓库

1. 访问 [GitHub](https://github.com) 并登录
2. 点击右上角 "+" → "New repository"
3. 仓库名：`universal-dns-hub`
4. 选择 Public 或 Private
5. 点击 "Create repository"

#### 第五步：连接并推送

```bash
# 添加远程仓库
git remote add origin https://github.com/your-username/universal-dns-hub.git

# 推送代码
git branch -M main
git push -u origin main
```

首次推送时需要输入 GitHub 用户名和密码（或 Personal Access Token）。

详细步骤请参考 [GITHUB.md](./GITHUB.md)

---

## 📂 项目结构

```
universal-dns-hub/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API Routes
│   │   │   ├── health/         # 健康检查
│   │   │   ├── domains/        # 域名管理 API
│   │   │   ├── records/        # DNS 记录 API
│   │   │   ├── providers/      # 服务商管理 API
│   │   │   ├── ai/            # AI 智能调度 API
│   │   │   └── ai-config/     # AI 配置 API
│   │   ├── providers/          # 服务商管理页面
│   │   ├── domains/            # 域名管理页面
│   │   ├── ai-config/         # AI 配置页面
│   │   └── logs/              # 操作日志页面
│   ├── components/
│   │   ├── ui/                # shadcn/ui 组件
│   │   ├── ai-magic-box.tsx   # AI 智能调度组件
│   │   └── layout/            # 布局组件
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts       # 数据库 Schema
│   │   │   └── connection.ts  # 数据库连接
│   │   ├── encryption.ts       # AES-256 加密
│   │   └── providers/         # DNS Provider 实现
│   │       ├── base.ts         # Provider 基础接口
│   │       ├── cloudflare.ts   # Cloudflare 实现
│   │       ├── alidns.ts       # 阿里云 DNS 实现
│   │       └── tencent.ts     # 腾讯云 DNS 实现
│   └── ...
├── Dockerfile                 # Docker 镜像构建文件
├── docker-compose.yml          # Docker Compose 配置
├── .env.example              # 环境变量示例
├── .gitignore               # Git 忽略文件
├── DEPLOYMENT.md            # 部署指南
├── GITHUB.md               # GitHub 提交指南
└── SUMMARY.md              # 本文件
```

---

## 🔧 关键文件说明

### Dockerfile
- 定义 Docker 镜像构建步骤
- 基于 Node.js 24 Alpine
- 包含开发环境和生产环境的多阶段构建

### docker-compose.yml
- 定义应用和数据库服务
- 自动配置网络和数据卷
- 包含健康检查

### .env
- 数据库连接字符串
- AES-256 加密密钥（必须固定！）
- AI API 配置

**重要**: `.env` 文件已添加到 `.gitignore`，不会被提交到 GitHub

---

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env

# 3. 初始化数据库
pnpm drizzle-kit push

# 4. 启动开发服务器
pnpm dev
```

### Docker 部署

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止服务
docker-compose down
```

### 推送到 GitHub

```bash
# 添加文件
git add .

# 提交
git commit -m "feat: add deployment configuration"

# 推送
git push
```

---

## 📚 相关文档

- **[README.md](./README.md)** - 项目完整介绍
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - 详细部署指南
- **[GITHUB.md](./GITHUB.md)** - GitHub 提交指南
- **[PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md)** - 架构设计文档
- **[QUICKSTART.md](./QUICKSTART.md)** - 快速开始指南

---

## 🎯 下一步

1. **配置环境变量**: 复制 `.env.example` 为 `.env` 并填写配置
2. **本地测试**: 运行 `pnpm dev` 启动开发服务器
3. **提交代码**: 按照 [GITHUB.md](./GITHUB.md) 提交到 GitHub
4. **部署上线**: 按照 [DEPLOYMENT.md](./DEPLOYMENT.md) 部署到生产环境

---

## 💡 提示

1. **加密密钥**: 必须设置为固定值，否则每次重启后无法解密旧数据
2. **环境变量**: `.env` 文件不要提交到 GitHub
3. **数据库**: 使用 Docker Compose 会自动创建 PostgreSQL 容器
4. **健康检查**: 访问 `/api/health` 检查服务状态

---

**需要帮助？**
- 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 了解部署问题
- 查看 [GITHUB.md](./GITHUB.md) 了解 Git/GitHub 问题
- 在 GitHub 提交 Issue

祝你使用愉快！🚀
