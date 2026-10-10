// Middleware（中间件）最早然后到 Guard 守卫了，最后到 Controller 层
// ┌──【Filters 异常过滤器 (最外层全局 try ... catch 保护罩)】──────────────────┐
// │                                                                             │
// │   客户端请求                                                                │
// │      │                                                                      │
// │      ▼                                                                      │
// │   1. Middleware (中间件)                                                    │
// │      │                                                                      │
// │      ▼                                                                      │
// │   2. Guards (守卫) ───────💥[抛出 401/429 报错]──────┐                      │
// │      │ (放行)                                         │                     │
// │      ▼                                                │                     │
// │   3. Interceptors (前置)  拦截器                            │                     │
// │      │                                                │                     │
// │      ▼                                                ▼                     │
// │   4. Pipes (参数管道) ────💥[参数校验失败 400]───►【Filters 瞬间接管】      │
// │      │ (合格)                                         ▲                     │
// │      ▼                                                │                     │
// │   5. Controller/Service ──💥[业务报错 500]────────────┤                     │
// │      │ (成功执行)                                     │                     │
// │      ▼                                                │                     │
// │   6. Interceptors (后置打包 {code: 200}) 拦截器          │                     │
// │      │                                                │                     │
// │      ▼                                                ▼                     │
// │   返回客户端 (200 成功数据)                   返回客户端 (规范的错误 JSON)  │
// │                                                                             │
// └─────────────────────────────────────────────────────────────────────────────┘

// src/middlewares/date-format.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DateFormatMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        const originalJson = res.json;
        // 使用箭头函数保持 this 上下文指向正确的中间件实例
        res.json = body => {
            if (Array.isArray(body.data)) {
                body.data.forEach(item => this.transformCreatedAt(item));
            } else if (body.data && typeof body.data === 'object') {
                this.transformCreatedAt(body.data);
            }
            return originalJson.call(res, body); // 返回 originalJson 的结果
        };

        next();
    }

    transformCreatedAt(item: any) {
        if (item.created_at) {
            item.created_at = new Date(item.created_at).toLocaleString();
        }
        if (item.updated_at) {
            item.updated_at = new Date(item.updated_at).toLocaleString();
        }
        // 如果有嵌套对象，递归处理
        for (const key in item) {
            if (item[key] && typeof item[key] === 'object') {
                this.transformCreatedAt(item[key]);
            }
        }
    }
}
