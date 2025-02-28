import { Module } from '@nestjs/common';
import { ai_testservice } from './ai-com.service';
import { AiController } from './ai-com.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatRecord } from './entities/ai-com.entity';

@Module({
    // 在里需要使用forwardRef 解决循环依赖问题
    imports: [TypeOrmModule.forFeature([ChatRecord])],
    controllers: [AiController],
    providers: [ai_testservice],
    exports: [ai_testservice],
})
export class AiModule {}
