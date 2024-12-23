import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InternalusersService } from '../internalusers/internalusers.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: InternalusersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    async validateUser(username: string, password: string): Promise<any> {
        const user = await this.userService.validateUser(username, password); // 调用用户服务中的验证逻辑
        console.log(user, 'user');
        if (user) {
            const { password, ...result } = user; // 不返回密码
            return result;
        }
        throw new HttpException('用户或密码不正确', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    async login(user: any): Promise<{ token: string; refreshToken: string }> {
        const payload = { username: user.username, sub: user.id };
        return {
            token: this.jwtService.sign(payload),
            refreshToken: this.jwtService.sign(payload, {
                secret: this.configService.get<string>('REFRESH_SECRET'),
                expiresIn: this.configService.get<string>('REFRESH_EXPIRES_IN'),
            }),
        };
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

        return {
            token: newAccessToken,
            refreshToken: newRefreshToken,
        };
    }
}
