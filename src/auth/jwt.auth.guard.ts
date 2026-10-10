import { Injectable, ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(
        private reflector: Reflector,
        private redisService: RedisService,
    ) {
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
            // 1. Passport 验证 JWT 基础签名和有效期
            const result = (await super.canActivate(context)) as boolean;
            if (!result) return false;

            // 2. 🌟 验证 Redis 白名单中该用户的 Token 是否依然存活且一致
            const user = request.user;
            if (user && user.userId) {
                // 仅当 Redis 在线可用时执行白名单精确比对；若 Redis 宕机，自动优雅降级信任 Passport 验签结果！
                if (this.redisService.isAvailable()) {
                    const clientToken = authHeader.replace(/^Bearer\s+/i, '').trim();
                    const cachedToken = await this.redisService.get(`auth:token:${user.userId}`);
                    if (!cachedToken || cachedToken !== clientToken) {
                        response.status(HttpStatus.OK).json({
                            code: 401,
                            message: '登录状态已失效或已安全退出，请重新登录.',
                        });
                        return false;
                    }
                }
            }

            return true;
        } catch (error) {
            // 验证失败，返回 401
            response.status(HttpStatus.OK).json({
                code: 401,
                message: 'Token 验证失败，请检查 Token 是否正确',
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
