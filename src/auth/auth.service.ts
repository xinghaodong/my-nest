import { forwardRef, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InternalusersService } from '../internalusers/internalusers.service';
import { ConfigService } from '@nestjs/config';
import { MenusService } from '../menus/menus.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: InternalusersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        @Inject(forwardRef(() => MenusService)) // 在里需要使用 forwardRef 解决循环依赖问题
        private readonly menuService: MenusService,
        private readonly redisService: RedisService,
    ) {}

    /**
     * 将配置的过期时间（如 1h / 24h / 60m）解析为秒数
     */
    private parseExpiresInSeconds(expiresIn?: string, defaultSeconds = 3600): number {
        if (!expiresIn) return defaultSeconds;
        const match = expiresIn.match(/^(\d+)([smhd])$/i);
        if (!match) return defaultSeconds;
        const val = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        switch (unit) {
            case 's':
                return val;
            case 'm':
                return val * 60;
            case 'h':
                return val * 3600;
            case 'd':
                return val * 86400;
            default:
                return defaultSeconds;
        }
    }

    async validateUser(username: string, password: string): Promise<any> {
        const user = await this.userService.validateUser(username, password); // 调用用户服务中的验证逻辑
        if (user) {
            // console.log('user:', user);
            const { password, ...result } = user; // 不返回密码
            return result;
        }
        throw new HttpException('用户或密码不正确', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    /**
     * 登录函数
     * 生成用户登录所需的token、refreshToken、权限列表和用户信息对象
     * @param user 包含用户信息的对象，至少需要有username和id属性
     * @returns 返回一个Promise对象，包含token、refreshToken、perms和informationObject
     */
    async login(user: any): Promise<{ token: string; refreshToken: string; perms: string[]; informationObject: object }> {
        const payload = { username: user.username, sub: user.id };
        const perms = await this.menuService.getPermsByUserId(user.id);
        const informationObject = await this.userService.findOneAll(user.id);

        const token = this.jwtService.sign(payload);
        const refreshToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('REFRESH_SECRET'),
            expiresIn: this.configService.get<string>('REFRESH_EXPIRES_IN'),
        });

        // 🌟 将登录 Token 存入 Redis 白名单（键名: auth:token:用户ID）
        const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
        const ttlSeconds = this.parseExpiresInSeconds(jwtExpiresIn, 3600);
        await this.redisService.set(`auth:token:${user.id}`, token, ttlSeconds);

        return {
            token,
            refreshToken,
            perms,
            informationObject,
        };
    }

    /**
     * 安全注销/退出登录：立即清除 Redis 白名单中的 Token
     */
    async logout(userId: number): Promise<boolean> {
        await this.redisService.del(`auth:token:${userId}`);
        return true;
    }

    async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
        let payload;
        try {
            // 验证 refreshToken 是否有效
            payload = this.jwtService.verify(refreshToken, { secret: this.configService.get<string>('REFRESH_SECRET') });
        } catch (error) {
            throw new HttpException('refresh token 验证失败', HttpStatus.INTERNAL_SERVER_ERROR);
        }
        // 根据 payload 查找用户
        const user = await this.userService.findByUsername(payload.username);
        if (!user) {
            throw new Error('未找到用户');
        }

        // 根据用户信息生成新的 Token 和 refreshToken
        const newAccessToken = this.jwtService.sign(
            { username: user.username, sub: user.id },
            {
                secret: this.configService.get<string>('JWT_SECRET'),
                expiresIn: this.configService.get<string>('JWT_EXPIRES_IN'), // 取配置中 Token 过期时间
            },
        );

        const newRefreshToken = this.jwtService.sign(
            { username: user.username, sub: user.id },
            {
                secret: this.configService.get<string>('REFRESH_SECRET'),
                expiresIn: this.configService.get<string>('REFRESH_EXPIRES_IN'), // 取配置中 refreshToken 过期时间
            },
        );

        // 🌟 刷新 Token 时，同步更新 Redis 白名单
        const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
        const ttlSeconds = this.parseExpiresInSeconds(jwtExpiresIn, 3600);
        await this.redisService.set(`auth:token:${user.id}`, newAccessToken, ttlSeconds);

        return {
            token: newAccessToken,
            refreshToken: newRefreshToken,
        };
    }

    // 新增解码方法
    decode(token: string): any {
        try {
            // 使用 JwtService 的 decode 方法解码 token
            return this.jwtService.decode(token);
        } catch (error) {
            throw new HttpException('token 失效', HttpStatus.UNAUTHORIZED);
        }
    }
}
