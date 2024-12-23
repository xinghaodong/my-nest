import { Injectable, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private reflector: Reflector) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [context.getHandler(), context.getClass()]);
        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        // 检查是否传递了 Token
        const authHeader = request.headers['authorization'];
        if (!authHeader) {
            response.status(HttpStatus.OK).json({
                code: 400,
                message: '请求缺少 Token，请检查是否已传递',
            });
            return false; // 阻止后续逻辑
        }

        try {
            // 验证 Token
            const result = await super.canActivate(context);
            console.log('验证结果：', result);
            return result as boolean;
        } catch (error) {
            console.error('Token 验证失败：', error);
            // 验证失败，返回 401
            response.status(HttpStatus.OK).json({
                code: 401,
                message: 'Token 验证失败，请检查 Token 是否正确1',
            });
            return false; // 阻止后续逻辑
        }
    }

    // handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    //     // 避免 AuthGuard 抛出异常
    //     if (err || !user) {
    //         return null;
    //     }
    //     return user;
    // }
}
