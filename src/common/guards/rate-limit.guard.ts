import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
    private readonly logger = new Logger(RateLimitGuard.name);

    constructor(
        private readonly reflector: Reflector, // 固定的 专门用来“看便签条”的扫描仪！
        private readonly redisService: RedisService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 第一步：保安掏出扫描仪，扫描门头上贴的那张便利贴！
        const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
        // 如果未声明 @RateLimit，则不作限制直接放行
        if (!options) {
            return true;
        }

        // 🌟 高可用降级第一道防线：若 Redis 当前处于离线/未连接状态，自动降级放行
        if (!this.redisService.isAvailable()) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        // 获取真实客户端 IP
        const clientIp = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip || request.socket?.remoteAddress || '127.0.0.1';

        const path = request.route?.path || request.url;
        // Key 规则: rate:ip:127.0.0.1:path:/api/auth/login
        const cacheKey = `rate:ip:${clientIp}:path:${path}`;

        const client = this.redisService.getClient();
        if (!client) {
            return true;
        }

        try {
            // 第二步：保安看到便利贴写着 limit: 5，于是去查 Redis 计数器
            // 原子操作：每次请求计数 +1
            const currentCount = await client.incr(cacheKey);
            // 如果是该窗口内的第一次请求，设置过期 TTL
            if (currentCount === 1) {
                await client.expire(cacheKey, options.ttl);
            }

            // 第三步：如果查到这个人已经超过 5 次了，保安当场亮红牌踢出大门！
            // 超过阈值，直接阻断并抛出 HTTP 429
            if (currentCount > options.limit) {
                const message = options.message || `请求过于频繁，请等待 ${options.ttl} 秒后再试`;
                throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
            }
        } catch (e: any) {
            // 如果是正常的限流业务异常，继续向上抛出
            if (e instanceof HttpException) {
                throw e;
            }
            // 🌟 高可用降级第二道防线：Redis 出现网络/断开异常（如 Connection is closed），优雅放行
            this.logger.warn(`⚠️ [RateLimitGuard] Redis 异常，防刷限流器自动安全降级放行: ${e.message}`);
            return true;
        }

        return true;
    }
}
