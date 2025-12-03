import { Module } from '@nestjs/common';
import { ai_testservice } from './ai-com.service';
import { AiController } from './ai-com.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatRecord, Message } from './entities/ai-com.entity';
import { AiComSttService } from './ai-com.stt.service';
import { AiTtsStreamService } from './ai-tts-stream.service';

@Module({
    // 在里需要使用forwardRef 解决循环依赖问题
    imports: [TypeOrmModule.forFeature([ChatRecord, Message])],
    controllers: [AiController],
    providers: [ai_testservice, AiComSttService, AiTtsStreamService],
    exports: [ai_testservice],
})
export class AiModule {}
