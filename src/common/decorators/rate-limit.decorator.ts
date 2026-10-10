import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
    /** 窗口期内允许的最大请求次数（默认 5） */
    limit: number;
    /** 时间窗口大小，单位：秒（默认 60） */
    ttl: number;
    /** 被拦截时的友好错误提示 */
    message?: string;
}

export const RATE_LIMIT_KEY = 'rate_limit_options';

/**
 * 接口防刷限流装饰器
 * @example @RateLimit({ limit: 5, ttl: 60, message: '登录尝试过于频繁，请1分钟后再试' })
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
