import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ai_testservice } from './ai-com.service';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai')
export class AiController {
    constructor(private readonly aiService: ai_testservice) {}

    @Public()
    @Get('stream')
    async streamAI(@Query('prompt') prompt: string, @Res() res: Response) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');

        try {
            // 调用 AI 服务，获取流式数据
            await this.aiService.callModelStream(prompt, res);
        } catch (error) {
            console.error('Error during AI streaming:', error);
            res.status(500).write('data: {"error": "AI 流式请求失败"}\n\n');
            res.end();
        }
    }

    // 保存聊天记录
    @Public()
    @Post('save-record')
    @Post('save-record')
    async saveChatRecord(@Body('role') role: string, @Body('content') content: string, @Body('conversationId') conversationId: string): Promise<string> {
        await this.aiService.saveChatRecord(role, content, conversationId);
        return 'Chat record saved successfully!';
    }
}
