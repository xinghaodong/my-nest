import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private client: Redis;
    private readonly logger = new Logger(RedisService.name);
    private isConnected = false;

    constructor(private readonly configService: ConfigService) {}

    onModuleInit() {
        const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
        const port = Number(this.configService.get<number>('REDIS_PORT', 6379));
        const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
        const db = Number(this.configService.get<number>('REDIS_DB', 0));
        const keyPrefix = this.configService.get<string>('REDIS_PREFIX', 'my_nest:');

        this.client = new Redis({
            host,
            port,
            password,
            db,
            keyPrefix,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            retryStrategy: times => {
                // 重试 3 次后暂时停止频繁重试，避免刷屏
                if (times > 3) {
                    return null;
                }
                return Math.min(times * 1000, 3000);
            },
        });

        this.client.on('connect', () => {
            this.isConnected = true;
            this.logger.log(`🚀 [Redis] 成功连接(${host}:${port}, db: ${db}, prefix: "${keyPrefix}")`);
        });

        this.client.on('error', err => {
            this.isConnected = false;
            this.logger.warn(`⚠️ [Redis] 连接异常: ${err.message} (系统将安全降级走数据库)`);
        });

        this.client.connect().catch(err => {
            this.isConnected = false;
            this.logger.warn(`⚠️ [Redis] 初始化连接失败: ${err.message} (系统将安全降级走数据库)`);
        });
    }

    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit();
        }
    }

    /**
     * 获取缓存
     */
    async get(key: string): Promise<string | null> {
        if (!this.isConnected) return null;
        try {
            return await this.client.get(key);
        } catch (e: any) {
            this.logger.warn(`Redis get("${key}") 失败: ${e.message}`);
            return null;
        }
    }

    /**
     * 获取 JSON 对象缓存
     */
    async getJson<T = any>(key: string): Promise<T | null> {
        const val = await this.get(key);
        if (!val) return null;
        try {
            return JSON.parse(val) as T;
        } catch (e: any) {
            this.logger.warn(`Redis 解析 JSON 缓存失败 ("${key}"): ${e.message}`);
            return null;
        }
    }

    /**
     * 写入缓存
     * @param key 键名 (无需手动加 my_nest: 前缀，ioredis 会自动添加)
     * @param value 字符串值 (复杂对象请转 JSON 或使用 setJson)
     * @param ttlSeconds 过期时间（秒），可选
     */
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (!this.isConnected) return;
        try {
            if (ttlSeconds && ttlSeconds > 0) {
                await this.client.set(key, value, 'EX', ttlSeconds);
            } else {
                await this.client.set(key, value);
            }
        } catch (e: any) {
            this.logger.warn(`Redis set("${key}") 失败: ${e.message}`);
        }
    }

    /**
     * 写入 JSON 对象缓存
     */
    async setJson(key: string, value: any, ttlSeconds?: number): Promise<void> {
        try {
            const jsonStr = JSON.stringify(value);
            await this.set(key, jsonStr, ttlSeconds);
        } catch (e: any) {
            this.logger.warn(`Redis 序列化 JSON 失败 ("${key}"): ${e.message}`);
        }
    }

    /**
     * 删除缓存
     */
    async del(key: string): Promise<void> {
        if (!this.isConnected) return;
        try {
            await this.client.del(key);
        } catch (e: any) {
            this.logger.warn(`Redis del("${key}") 失败: ${e.message}`);
        }
    }

    /**
     * 批量按通配符模式删除缓存（例如 delPattern('menus:*')）
     */
    async delPattern(pattern: string): Promise<number> {
        if (!this.isConnected) return 0;
        try {
            const prefix = this.configService.get<string>('REDIS_PREFIX', 'my_nest:');
            // 关键：ioredis 不会对 keys(pattern) 自动加上 keyPrefix，必须手动拼上前缀才能在 Redis 中匹配！
            const fullPattern = pattern.startsWith(prefix) ? pattern : `${prefix}${pattern}`;
            const keys = await this.client.keys(fullPattern);
            if (!keys || keys.length === 0) {
                console.log(`ℹ️ [Redis delPattern] 未匹配到任何待清理键: ${fullPattern}`);
                return 0;
            }

            console.log(`🧹 [Redis delPattern] 匹配到待淘汰键:`, keys);

            // ioredis 在 del(...) 时会自动拼接 keyPrefix，所以传给 del 前必须剥离 prefix，防止产生双重前缀
            const strippedKeys = keys.map(k => (k.startsWith(prefix) ? k.slice(prefix.length) : k));
            const deletedCount = await this.client.del(...strippedKeys);
            console.log(`🗑️ [Redis delPattern] 成功淘汰缓存数量: ${deletedCount}`);
            return deletedCount;
        } catch (e: any) {
            this.logger.warn(`Redis delPattern("${pattern}") 失败: ${e.message}`);
            return 0;
        }
    }

    /**
     * 判断当前 Redis 是否连接正常可用
     */
    isAvailable(): boolean {
        return this.isConnected;
    }

    /**
     * 检查客户端实例
     */
    getClient(): Redis {
        return this.client;
    }
}
