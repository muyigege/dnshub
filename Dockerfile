# Universal DNS Hub - Dockerfile
# 基于 Node.js 24 的生产环境镜像

FROM node:24-slim AS base

# 设置 CI 环境变量，防止 pnpm 交互式提示阻塞构建
ENV CI=true

# 设置工作目录
WORKDIR /app

# 复制依赖文件和配置文件
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装项目依赖（pnpm-workspace.yaml 已配置 allowBuilds）
RUN pnpm install

# 复制项目代码
COPY . .

# 构建生产版本
RUN pnpm build

# 生产环境镜像
FROM node:24-slim AS production

WORKDIR /app

# 从构建阶段复制完整的 node_modules（包含已编译的原生模块）
COPY --from=base /app/node_modules ./node_modules

# 从构建阶段复制构建产物
COPY --from=base /app/.next ./.next
COPY --from=base /app/src ./src
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/next.config.* ./

# 创建非 root 用户及持久化数据目录
RUN useradd -m -u 1001 appuser && \
    mkdir -p /app/data && \
    chown -R appuser:appuser /app

USER appuser

# 暴露端口
EXPOSE 5000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=5000

# 启动应用
CMD ["pnpm", "start"]
