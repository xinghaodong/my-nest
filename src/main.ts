import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response';
import { HttpExceptionFilter } from './common/requestFailed';
import { BadRequestException, HttpException, HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
// 自定义转换逻辑
import * as bodyParser from 'body-parser';
import { JwtAuthGuard } from './auth/jwt.auth.guard';
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api'); // 设置全局路由前缀为 'api'
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
    app.useGlobalInterceptors(new ResponseInterceptor());
    // 启用全局验证管道
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true, // 自动转换数据类型
            whitelist: true, // 是否剔除未声明的字段
            forbidNonWhitelisted: false, // 是否禁止未声明字段的存在
            transformOptions: {
                enableImplicitConversion: true, // 禁用隐式类型转换
                exposeUnsetFields: false, // 防止未设置字段被影响
            },
            // exceptionFactory: errors => {
            //     console.error(errors); // 打印验证错误
            //     // return new BadRequestException(errors); // 返回自定义的异常信息
            // },
        }),
    );
    // 设置全局守卫
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
