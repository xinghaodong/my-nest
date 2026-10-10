import { Controller, Post, Body, HttpException, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // 不需要传递 Token，但受 IP 限流保护（1 分钟内最多尝试 5 次）
    // @RateLimit(...) 是“参数配置（规则）”；
    // @UseGuards(RateLimitGuard) 是“执行者（保安）”；
    @Public()
    @UseGuards(RateLimitGuard)
    @RateLimit({ limit: 5, ttl: 60, message: '登录尝试过于频繁，请1分钟后再试' })
    @Post('login')
    async login(@Body() body: { username: string; password: string }) {
        const user = await this.authService.validateUser(body.username, body.password);
        if (!user) {
            throw new HttpException('未找到用户', HttpStatus.NOT_FOUND);
        }
        return this.authService.login(user);
    }

    // 安全退出登录接口（受全局 JwtAuthGuard 校验，自动从 req.user 获取当前用户并清空 Redis 白名单）
    @Post('logout')
    async logout(@Req() req: any) {
        const userId = req.user?.userId;
        if (userId) {
            await this.authService.logout(userId);
        }
        return { message: '退出登录成功' };
    }

    // 刷新Token接口
    @Public()
    @Post('refresh')
    async refreshToken(@Body() body: { refreshToken: string }) {
        return this.authService.refreshToken(body.refreshToken);
    }
}
