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
