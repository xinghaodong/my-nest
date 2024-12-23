import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InternalusersModule } from './internalusers/internalusers.module';
import { FilelistModule } from './filelist/filelist.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

// import { MulterModule } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { extname } from 'path';
import { MenusModule } from './menus/menus.module';
import { RoleModule } from './role/role.module';
import { DateFormatMiddleware } from './common/middleware/formattingTime';
import { AuthModule } from './auth/auth.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true, // 使 ConfigModule 在整个应用程序中可用
        }),
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'uploads'), // 静态文件目录
            serveRoot: '/api/uploads', // 对外暴露的路径前缀
        }),
        // MulterModule.register({
        //     storage: diskStorage({
        //         destination: './uploads', // 指定存储目录
        //         filename: (req, file, callback) => {
        //             const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        //             const ext = extname(file.originalname);
        //             callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        //         },
        //     }),
        // }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule], // 确保 ConfigModule 被导入
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                type: 'mysql', // 数据库类型 DB_TYPE
                entities: [__dirname + '/**/*.entity{.ts,.js}'], // 数据表实体，synchronize为true时，自动创建表，生产环境建议关闭
                host: configService.get('DB_HOST'), // 主机，默认为localhost
                port: configService.get<number>('DB_PORT'), // 端口号
                username: configService.get('DB_USERNAME'), // 用户名
                password: configService.get('DB_PASSWORD'), // 密码
                database: configService.get('DB_DATABASE'), //数据库名
                synchronize: true, //根据实体自动创建数据库表， 生产环境建议关闭
            }),
        }),
        InternalusersModule,
        FilelistModule,
        MenusModule,
        RoleModule,
        AuthModule, // 导入 InternalusersModule
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {
    constructor(private dataSource: DataSource) {}
    configure(consumer: MiddlewareConsumer) {
        // 应用中间件到所有路由
        consumer.apply(DateFormatMiddleware).forRoutes('*');
    }
}
