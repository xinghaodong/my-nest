import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ai_testservice } from './ai-com.service';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai')
export class AiController {
    constructor(private readonly aiService: ai_testservice) {}

    @Public()
    @Get('stream')
    async streamAI(@Query('prompt') prompt: string, @Query('conversationId') conversationId: string, @Res() res: Response) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');
        try {
            // 调用 AI 服务，获取流式数据
            await this.aiService.callModelStream(prompt, conversationId, res);
        } catch (error) {
            console.error('Error during AI streaming:', error);
            res.status(500).write('data: {"error": "AI 流式请求失败"}\n\n');
            res.end();
        }
    }

    // 接口：创建新会话并保存第一条消息
    @Public()
    @Post('start-conversation')
    async startConversation(@Body('content') content: string): Promise<{ any }> {
        return await this.aiService.saveConversation(content);
    }

    // 保存聊天记录
    @Public()
    @Post('save-record')
    async saveChatRecord(@Body('role') role: string, @Body('content') content: string, @Body('conversationId') conversationId: string): Promise<string> {
        await this.aiService.saveChatRecord(role, content, conversationId);
        return '保存成功';
    }

    // 查询全部的回话记录
    @Public()
    @Get('all-conversations')
    async getAllConversations(): Promise<any[]> {
        return await this.aiService.getAllConversations();
    }

    // 根据会话id查询聊天记录
    @Public()
    @Get('conversation-history') // 添加 @Get 装饰器
    async getConversationHistory(@Query('conversationId') conversationId: string, @Query('type') type?: string): Promise<any[]> {
        return await this.aiService.getConversationHistory(conversationId, type);
    }

    // 天气查询
    @Public()
    @Get('weather')
    async getWeather(@Query('city') city: string): Promise<any> {
        return await this.aiService.getCurrentWeather(city);
    }
}
