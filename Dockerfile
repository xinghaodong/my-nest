# 使用 Node.js 官方镜像作为基础镜像
FROM node:20.8.1

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 构建 Nest.js 应用
RUN npm run build

# 设置容器启动时运行的命令
CMD ["npm", "run", "start:prod"]

# 暴露容器的端口
EXPOSE 3000
