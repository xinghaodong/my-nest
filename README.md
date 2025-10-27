<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

    <p align="center">

<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
<a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
<a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
<a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>

</p>

## Description

📝 项目描述
这是一个基于 NestJS 的 Node.js 后端服务框架，采用 TypeScript 编写，旨在构建高效、可扩展的服务器端应用程序。该项目已经配置了基础依赖与开发工具链，支持快速启动、热重载等现代开发流程。

已实现的核心功能模块包括：

- 用户认证与授权系统 (Auth Module)
- 内部用户管理 (InternalUsers Module)
- 菜单权限管理 (Menus Module)
- 角色权限控制 (Role Module)
- 组织架构管理 (OrgManagement Module)
- 文件上传与管理 (FileList Module)
- 流程审批系统 (ProcessApproval Module) (待完善)
- AI 对话集成 (AI-Com Module，支持本地模型如 Ollama 和云端服务(是接入了阿里千问的API))

⚡ 技术特性

🔐 完整的认证授权

- 基于 JWT 的身份验证
- 细粒度的 RBAC 权限控制
- 双Token支持 Token 刷新机制

🏗 模块化架构

- 基于 Nest 的模块系统，实现业务逻辑解耦
- 统一的响应拦截器和异常过滤器
- 全局中间件支持（如日期格式化）

🔧 开发体验优化

- 支持 start:dev 热重载模式
- 完整的 TypeScript 类型支持
- 规范的代码风格配置（ESLint + Prettier）
- 内置日志和异常处理机制

🗄 数据持久化

- 集成 TypeORM，MYSQL 数据库
- 文件上传和静态资源服务
- 实体关系映射的最佳实践

🚀 部署就绪

- Docker 容器化支持(待完善)
- 环境配置分离（development/production）
- 提供 start:prod 生产环境构建和运行方案

🔌 扩展能力

- AI 模型集成（支持本地Ollama需要先在本地下载模型文件，如 Llama3.1,deepseek等开源模型文件）
  等）
- 支持文件上传和静态资源服务
- 可轻松扩展更多第三方服务集成
