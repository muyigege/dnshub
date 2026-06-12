# Universal DNS Hub - Dockerfile
# 基于 Node.js 24 的生产环境镜像

FROM node:24-slim AS base

# 配置国内源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list

# 安装依赖
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml* ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装项目依赖
RUN pnpm install

# 复制项目代码
COPY . .

# 构建生产版本
RUN pnpm build

# 生产环境镜像
FROM node:24-slim AS production

WORKDIR /app

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# 安装 pnpm
RUN npm install -g pnpm

# 只安装生产依赖
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --unsafe-perm --shamefully-hoist --config.ignore-scripts=false

# 从构建阶段复制构建产物
COPY --from=base /app/.next ./.next
# COPY --from=base /app/public ./public
COPY --from=base /app/src ./src
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/tailwind.config.* ./
COPY --from=base /app/postcss.config.* ./
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
