import { Module } from '@nestjs/common';
import { ai_testservice } from './ai-com.service';
import { AiController } from './ai-com.controller';

@Module({
    // 在里需要使用forwardRef 解决循环依赖问题
    imports: [],
    controllers: [AiController],
    providers: [ai_testservice],
    exports: [ai_testservice],
})
export class AiModule {}
