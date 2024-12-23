import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // 不需要传递 Token
    @Public()
    @Post('login')
    async login(@Body() body: { username: string; password: string }) {
        const user = await this.authService.validateUser(body.username, body.password);
        if (!user) {
            throw new HttpException('未找到用户', HttpStatus.NOT_FOUND);
        }
        return this.authService.login(user);
    }

    // 刷新Token接口
    @Public()
    @Post('refresh')
    async refreshToken(@Body() body: { refreshToken: string }) {
        return this.authService.refreshToken(body.refreshToken);
    }
}
