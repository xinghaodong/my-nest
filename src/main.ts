import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response';
import { HttpExceptionFilter } from './common/requestFailed';
import { BadRequestException, HttpException, HttpStatus, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// 自定义转换逻辑
import * as bodyParser from 'body-parser';
import { JwtAuthGuard } from './auth/jwt.auth.guard';
import { RedisService } from './common/redis/redis.service';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
async function bootstrap() {
    // 加上泛型 <NestExpressApplication>
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    // 关键就这三行（根据你刚才打印的结果写死即可）
    const uploadsPath = join(process.cwd(), 'uploads');
    app.useStaticAssets(uploadsPath, { prefix: '/uploads' });
    app.useStaticAssets(uploadsPath, { prefix: '/api/uploads' }); // 兼容你服务器

    app.setGlobalPrefix('api');

    // 配置 Multer
    // const upload = multer({
    //     dest: 'uploads/',
    // });
    // app.use('/api/upload', upload.single('avatar'));
    app.use(
        bodyParser.json({
            reviver: (key, value) => (value === '' ? null : value), // 空字符串全局转换为 null
        }),
    );
    // 注册全局拦截器
    // 凡是“成功”的请求，全走这里包装成 { code: 200, message: '操作成功', data }
    app.useGlobalInterceptors(new ResponseInterceptor());
    // 启用全局验证管道
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true, // 自动转换数据类型
            whitelist: false, // 是否剔除未声明的字段
            forbidNonWhitelisted: false, // 是否禁止未声明字段的存在
            transformOptions: {
                enableImplicitConversion: true, // 禁用隐式类型转换
                exposeUnsetFields: false, // 防止未设置字段被影响
            },
            exceptionFactory: (errors: ValidationError[]) => {
                // 递归提取所有字段校验失败的提示信息
                const extractErrors = (errList: ValidationError[]): string[] => {
                    const result: string[] = [];
                    for (const err of errList) {
                        if (err.constraints) {
                            // 🌟 软件工程人性化校验优先级：存在性 (isNotEmpty) > 类型 (isString/isNumber) > 格式
                            // 彻底避免未填写时却提示“必须为字符串”这种机械式反直觉问题
                            if (err.constraints.isNotEmpty) {
                                result.push(err.constraints.isNotEmpty);
                            }
                            for (const [key, msg] of Object.entries(err.constraints)) {
                                if (key !== 'isNotEmpty') {
                                    result.push(msg);
                                }
                            }
                        }
                        if (err.children && err.children.length > 0) {
                            result.push(...extractErrors(err.children));
                        }
                    }
                    return result;
                };

                const errorMessages = extractErrors(errors);
                const firstMessage = errorMessages[0] || '请求参数校验不合法';
                Logger.warn(`⚠️ [参数校验拦截] 发现 ${errorMessages.length} 处参数不合法: ${errorMessages.join('; ')}`);
                return new BadRequestException(firstMessage);
            },
        }),
    );
    // 设置全局守卫
    const reflector = app.get(Reflector);
    const redisService = app.get(RedisService);
    app.useGlobalGuards(new JwtAuthGuard(reflector, redisService));
    // 凡是“失败/报错”的请求，全走这里包装成规范的错误提示
    app.useGlobalFilters(new HttpExceptionFilter());
    // 启用 CORS
    app.enableCors({
        origin: '*', // 允许所有来源访问
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        allowedHeaders: 'Content-Type, Authorization',
    });
    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 3001);
    const host = configService.get<string>('HOST', '0.0.0.0');

    // await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
    await app.listen(port, host);
    console.log(`🚀 [NestJS] 服务已成功启动: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api`);
    console.log('NODE_ENV =', process.env.NODE_ENV);
    console.log('DB_PASSWORD =', process.env.DB_PASSWORD);
}
bootstrap();
