import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { InternalusersModule } from '../internalusers/internalusers.module'; // 引入用户模块
import { ConfigService, ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        InternalusersModule,
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule], // 依赖 ConfigModule
            inject: [ConfigService], // 注入 ConfigService
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN') },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
    exports: [AuthService],
})
export class AuthModule {}
