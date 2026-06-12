# 部署指南

Universal DNS Hub 支持多种部署方式，本文档将详细介绍各种部署方案。

## 📋 目录

- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [部署方式](#部署方式)
  - [Docker 部署](#docker-部署)
  - [Vercel 部署](#vercel-部署)
  - [Railway 部署](#railway-部署)
  - [Render 部署](#render-部署)
  - [VPS 部署](#vps-部署)

---

## 技术栈

### 前端
- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript 5
- **UI 库**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS 4
- **状态管理**: React 19 Hooks

### 后端
- **API**: Next.js API Routes
- **数据库**: PostgreSQL 15+
- **ORM**: Drizzle ORM
- **SDK**: coze-coding-dev-sdk (LLM & Database)

### 安全
- **加密**: AES-256-GCM
- **凭证管理**: 环境变量 + 加密存储

---

## 环境要求

### 本地开发
- Node.js 18+
- PostgreSQL 12+
- pnpm 8+

### 生产部署
- Docker 20.10+
- Docker Compose 2.0+
- 或者云平台账号（Vercel/Railway/Render）

---

## 部署方式

### Docker 部署

#### 1. 准备环境

确保已安装 Docker 和 Docker Compose：

```bash
# 检查 Docker 版本
docker --version
docker-compose --version
```

#### 2. 克隆项目

```bash
git clone <your-repository-url>
cd universal-dns-hub
```

#### 3. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下变量：

```env
# 数据库配置
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/universal_dns_hub

# 加密密钥（必须设置为固定值，建议使用随机生成的 32 字节密钥）
ENCRYPTION_KEY=your-256-bit-encryption-key-here-change-this

# 应用端口
PORT=5000

# 节点环境
NODE_ENV=production
```

生成加密密钥的方法：

```bash
# 方法 1: 使用 OpenSSL
openssl rand -base64 32

# 方法 2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 4. 使用 Docker Compose 启动

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v
```

#### 5. 访问应用

应用将在 `http://localhost:5000` 启动。

#### 6. 初始化数据库

首次启动后，需要初始化数据库表结构：

```bash
# 进入应用容器
docker-compose exec app sh

# 运行数据库迁移
pnpm drizzle-kit push

# （可选）运行种子数据
pnpm db:seed

# 退出容器
exit
```

#### 7. 生产环境优化

- **反向代理**: 使用 Nginx 或 Caddy 反向代理
- **HTTPS**: 配置 SSL 证书（Let's Encrypt）
- **监控**: 添加日志收集和监控（如 Prometheus + Grafana）

示例 Nginx 配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### Vercel 部署

Vercel 是 Next.js 官方推荐的部署平台，提供最简单的部署体验。

#### 1. 准备数据库

Universal DNS Hub 需要数据库支持，推荐使用：
- **Supabase** (免费 PostgreSQL)
- **Neon** (Serverless PostgreSQL)
- **Railway** (Managed PostgreSQL)

创建数据库后，获取连接字符串。

#### 2. 连接 GitHub 仓库

1. 访问 [Vercel](https://vercel.com)
2. 点击 "Add New Project"
3. 导入你的 GitHub 仓库
4. Vercel 会自动识别为 Next.js 项目

#### 3. 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

```env
DATABASE_URL=your-postgresql-connection-string
ENCRYPTION_KEY=your-256-bit-encryption-key
NODE_ENV=production
PORT=5000
```

#### 4. 部署

点击 "Deploy" 按钮，Vercel 会自动构建和部署。

#### 5. 注意事项

- Vercel 免费版不支持长时间运行的 API，但不影响本项目
- 数据库需要托管在外部服务
- 建议启用 Vercel Analytics 和监控

---

### Railway 部署

Railway 提供数据库和应用的一站式托管。

#### 1. 准备工作

1. 注册 [Railway](https://railway.app) 账号
2. 连接 GitHub 仓库

#### 2. 创建项目

1. 点击 "New Project" -> "Deploy from GitHub repo"
2. 选择你的仓库
3. Railway 会自动识别项目

#### 3. 配置服务

Railway 会自动添加 PostgreSQL 服务，你只需要配置环境变量：

```env
DATABASE_URL=${{RAILWAY_POSTGRES_URL}}
ENCRYPTION_KEY=your-256-bit-encryption-key
NODE_ENV=production
PORT=5000
```

#### 4. 部署

点击 "Deploy" 按钮，Railway 会自动部署。

---

### Render 部署

Render 提供免费的 Web 服务托管。

#### 1. 准备工作

1. 注册 [Render](https://render.com) 账号
2. 连接 GitHub 仓库

#### 2. 创建 Web Service

1. 点击 "New" -> "Web Service"
2. 选择你的仓库
3. 配置构建命令和启动命令：

```yaml
Build Command: pnpm install && pnpm build
Start Command: pnpm start
```

#### 3. 配置环境变量

添加以下环境变量：

```env
DATABASE_URL=your-postgresql-connection-string
ENCRYPTION_KEY=your-256-bit-encryption-key
NODE_ENV=production
PORT=5000
```

#### 4. 部署

点击 "Create Web Service"，Render 会自动部署。

---

### VPS 部署

如果你有自己的 VPS，可以手动部署。

#### 1. 准备 VPS

推荐配置：
- CPU: 2 核心以上
- 内存: 2GB 以上
- 系统: Ubuntu 22.04 LTS

#### 2. 安装依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
npm install -g pnpm

# 安装 PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 安装 Nginx（可选，用于反向代理）
sudo apt install -y nginx
```

#### 3. 配置数据库

```bash
# 创建数据库用户
sudo -u postgres createuser --interactive

# 创建数据库
sudo -u postgres createdb universal_dns_hub

# 设置密码
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'your-password';
\q
```

#### 4. 部署应用

```bash
# 克隆项目
git clone <your-repository-url>
cd universal-dns-hub

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 初始化数据库
pnpm drizzle-kit push

# 构建项目
pnpm build

# 启动应用（使用 PM2 管理进程）
npm install -g pm2
pm2 start pnpm --name "dns-hub" -- start
pm2 save
pm2 startup
```

#### 5. 配置 Nginx

创建 Nginx 配置文件 `/etc/nginx/sites-available/dns-hub`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/dns-hub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. 配置 HTTPS（推荐）

使用 Certbot 配置 Let's Encrypt：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔒 安全建议

1. **加密密钥**: 必须设置为固定值，不要每次重启都生成新密钥
2. **环境变量**: 使用 `.env` 文件，不要提交到 Git
3. **数据库**: 设置强密码，限制访问 IP
4. **HTTPS**: 生产环境必须使用 HTTPS
5. **定期备份**: 配置数据库自动备份

---

## 📊 监控和日志

### 健康检查

应用提供 `/api/health` 端点：

```bash
curl http://localhost:5000/api/health
```

### 查看日志

- **Docker**: `docker-compose logs -f app`
- **PM2**: `pm2 logs dns-hub`
- **Vercel**: 在 Dashboard 中查看实时日志
- **Railway**: 在项目 Logs 标签页查看

---

## 🔄 持续集成/部署 (CI/CD)

### GitHub Actions

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm build

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./
```

---

## ❓ 常见问题

### Q: Docker 部署后无法连接数据库？

**A**: 检查 `DATABASE_URL` 中的主机名是否为 `postgres`（Docker Compose 内部网络名称）。

### Q: 每次重启后之前添加的凭证都解密失败？

**A**: 检查 `ENCRYPTION_KEY` 是否为固定值。每次重启都生成新密钥会导致无法解密旧数据。

### Q: Vercel 部署后 API 报错？

**A**: 确保在 Vercel 项目设置中正确配置了所有环境变量，特别是 `DATABASE_URL` 和 `ENCRYPTION_KEY`。

### Q: 如何备份数据库？

**A**:
```bash
# Docker
docker-compose exec postgres pg_dump -U postgres universal_dns_hub > backup.sql

# VPS
pg_dump -U postgres universal_dns_hub > backup.sql

# 恢复
psql -U postgres universal_dns_hub < backup.sql
```

---

## 📞 技术支持

如遇到部署问题，请：
1. 检查本文档的"常见问题"部分
2. 查看 GitHub Issues
3. 提交新的 Issue，附上详细错误日志

---

## 📄 许可证

MIT License
