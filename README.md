# Universal DNS Hub

> 🌐 多云域名管理系统 - 统一管理 Cloudflare、阿里云、腾讯云等 DNS 服务商

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ 功能特性

### 🏢 多服务商集成
- ✅ **Cloudflare** - 全球领先的 DNS 和 CDN 服务
- ✅ **阿里云 DNS** - 国内主流云服务商
- ✅ **腾讯云 DNS** - 国内主流云服务商
- 🔮 可扩展架构，支持后续添加更多服务商

### 📋 域名管理
- 自动同步域名列表
- 域名分组管理
- 批量操作支持
- 实时记录状态监控

### 📝 DNS 记录管理
- 支持主流记录类型：A、CNAME、TXT、AAAA、MX、NS、SRV、SOA
- 增删改查完整 CRUD 操作
- 记录优先级和 TTL 配置
- 记录冲突检测

### 🤖 AI 智能调度中心
- 自然语言指令解析
- 自动识别操作意图（添加/删除/更新 DNS 记录）
- 操作预览与确认机制
- 支持自定义 AI 模型配置

### 🔐 安全与加密
- AES-256-GCM 加密存储敏感数据
- 凭证安全隔离
- 操作日志审计
- API 访问控制

## 🚀 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 12+
- pnpm 8+

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd universal-dns-hub
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，配置数据库和加密密钥
   ```

4. **初始化数据库**
   ```bash
   pnpm drizzle-kit push
   ```

5. **启动开发服务器**
   ```bash
   pnpm dev
   ```

   应用将在 http://localhost:5000 启动

## 📖 使用文档

### 添加服务商

1. 进入"服务商管理"页面
2. 点击"添加服务商"
3. 选择服务商类型（Cloudflare / 阿里云 / 腾讯云）
4. 填写凭证信息
   - Cloudflare: API Token
   - 阿里云: AccessKey ID & Secret
   - 腾讯云: Secret ID & Key
5. 点击"测试连接"验证凭证
6. 保存后同步域名列表

### 管理域名

1. 在侧边栏选择服务商
2. 进入"域名管理"页面
3. 查看所有同步的域名
4. 点击域名查看 DNS 记录

### 添加 DNS 记录

**方式一：手动添加**
1. 进入域名详情页面
2. 点击"添加记录"
3. 填写记录类型、名称、值等
4. 保存记录

**方式二：AI 智能调度**
1. 进入"AI 智能调度中心"
2. 输入自然语言指令，例如：
   - "帮我在 example.com 增加一个指向 1.2.3.4 的 A 记录"
   - "把 example.com 的 www 记录改成 8.8.8.8"
3. AI 自动解析并展示操作预览
4. 确认后执行操作

### AI 智能调度示例

| 自然语言指令 | 解析结果 |
|--------------|----------|
| "在 example.com 添加 A 记录指向 1.2.3.4" | ADD: A @ → 1.2.3.4 |
| "删除 example.com 的 www CNAME 记录" | DELETE: CNAME www |
| "把 api.example.com 的记录改成 2.3.4.5" | UPDATE: A api → 2.3.4.5 |
| "查看 example.com 的所有 TXT 记录" | QUERY: TXT * |

## 🏗️ 技术架构

### 技术栈
- **前端**: Next.js 16 (App Router) + Tailwind CSS 4 + shadcn/ui
- **后端**: Next.js Server Actions / API Routes
- **数据库**: PostgreSQL + Drizzle ORM
- **安全**: AES-256-GCM 加密

### 核心设计
- **接口抽象层**: 统一的 DNS Provider 接口，便于扩展新服务商
- **工厂模式**: 动态创建不同服务商实例
- **加密存储**: 敏感数据使用 AES-256-GCM 加密
- **AI 集成**: 支持自定义 OpenAI 格式的 API

### 架构图
```
┌─────────────────────────────────────────────────────────┐
│                     Next.js App Router                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  UI Pages    │  │  API Routes  │  │ Server Actions││
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Business Logic                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │DNS Providers │  │  Encryption  │  │  AI Service  │ │
│  │  Interface   │  │   Utility    │  │   Manager    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Data Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ PostgreSQL   │  │ Drizzle ORM  │  │   Encryption  │ │
│  │   Database   │  │              │  │   Key Store   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

详细架构设计请参考 [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md)

## 📁 目录结构

```
universal-dns-hub/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API Routes
│   │   ├── providers/          # 服务商管理页面
│   │   ├── domains/            # 域名管理页面
│   │   ├── ai-magic/           # AI 智能调度中心
│   │   └── settings/           # 配置中心
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 组件
│   │   ├── layout/             # 布局组件
│   │   └── ...
│   ├── lib/
│   │   ├── db/                 # 数据库 Schema 和连接
│   │   ├── encryption.ts       # AES-256 加密工具
│   │   └── providers/          # DNS Provider 实现
│   └── ...
├── drizzle.config.ts           # Drizzle 配置
├── .env.example                # 环境变量示例
└── README.md
```

## 🌍 部署

### Docker 部署（推荐）

使用 Docker Compose 一键部署：

```bash
# 1. 克隆项目
git clone <repository-url>
cd universal-dns-hub

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 DATABASE_URL 和 ENCRYPTION_KEY

# 3. 启动服务
docker-compose up -d

# 4. 访问应用
open http://localhost:5000
```

详细部署指南请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

### 云平台部署

- [Vercel](https://vercel.com) - Next.js 官方推荐
- [Railway](https://railway.app) - 一站式托管
- [Render](https://render.com) - 免费版支持

详细步骤请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## 📦 提交到 GitHub

### 快速开始

```bash
# 1. 初始化 Git 仓库
git init

# 2. 添加所有文件
git add .

# 3. 提交更改
git commit -m "feat: initial commit - Universal DNS Hub"

# 4. 在 GitHub 创建新仓库

# 5. 连接远程仓库
git remote add origin https://github.com/your-username/universal-dns-hub.git

# 6. 推送到 GitHub
git branch -M main
git push -u origin main
```

详细的 GitHub 提交指南请参考 [GITHUB.md](./GITHUB.md)

---

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: add AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 技术支持

- 📖 [完整文档](./docs/)
- 🐛 [问题反馈](https://github.com/your-username/universal-dns-hub/issues)
- 💬 [讨论区](https://github.com/your-username/universal-dns-hub/discussions)

---

## ⭐ Star History

如果这个项目对你有帮助，请给它一个 Star！

[![Star History Chart](https://api.star-history.com/svg?repos=your-username/universal-dns-hub&type=Date)](https://star-history.com/#your-username/universal-dns-hub&Date)

---

**Made with ❤️ by Universal DNS Hub Team**


```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

将生成的密钥设置到 `.env` 文件中的 `ENCRYPTION_KEY` 变量。

### 环境变量说明

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 数据库连接字符串 | ✅ |
| `ENCRYPTION_KEY` | AES-256 加密密钥（32 字节） | ✅ |
| `AI_API_URL` | AI API 地址 | ❌（默认 OpenAI） |
| `AI_MODEL_ID` | AI 模型 ID | ❌（默认 gpt-4） |
| `AI_API_KEY` | AI API Key | ❌（默认配置） |

## 🧪 测试

```bash
# 运行单元测试
pnpm test

# 运行集成测试
pnpm test:integration

# 生成测试覆盖率
pnpm test:coverage
```

## 📦 部署

### Vercel 部署

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量
4. 部署

### Docker 部署

```bash
# 构建镜像
docker build -t universal-dns-hub .

# 运行容器
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://... \
  -e ENCRYPTION_KEY=... \
  universal-dns-hub
```

## 🤝 贡献指南

欢迎贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详情。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 开源协议

本项目采用 MIT 协议开源 - 详见 [LICENSE](./LICENSE) 文件

## 🙏 致谢

- [Next.js](https://nextjs.org/) - React 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Drizzle ORM](https://orm.drizzle.team/) - 数据库 ORM
- [shadcn/ui](https://ui.shadcn.com/) - UI 组件库

## 📞 联系方式

- 项目主页: [GitHub Repository](#)
- 问题反馈: [Issues](#)
- 邮箱: support@example.com

---

**Built with ❤️ using Next.js & TypeScript**
