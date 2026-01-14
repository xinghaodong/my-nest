import { BadRequestException, Body, Controller, Get, ParseIntPipe, Post, Query, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ai_testservice } from './ai-com.service';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { FilelistService } from '../filelist/filelist.service';
import { AiComSttService } from './ai-com.stt.service';
import { AiTtsStreamService } from './ai-tts-stream.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';

@Controller('ai')
export class AiController {
    constructor(
        private readonly aiService: ai_testservice,
        private readonly filelistService: FilelistService,
        private readonly AiComSttService: AiComSttService,
        private readonly aiTtsStreamService: AiTtsStreamService,
    ) {}

    @Public()
    @Get('stream')
    async streamAI(
        @Query('prompt') prompt: string,
        @Query('conversationId') conversationId: string,
        @Query('model') model: string,
        @Query('enableInternetSearch') enableInternetSearch: string,
        @Query('useRag') useRag: string,
        @Res() res: Response,
    ) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');
        try {
            // 调用 AI 服务，获取流式数据
            await this.aiService.callModelStream(prompt, conversationId, model, enableInternetSearch, useRag, res);
        } catch (error) {
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

    // 查询 本地 ollama 模型
    @Public()
    @Get('ollama-models')
    async getOllamaModels(): Promise<any> {
        return await this.aiService.getOllamaModels();
    }

    // 谷歌查询
    @Public()
    @Get('google-search')
    async googleSearch(@Query('query') query: string): Promise<any> {
        return await this.aiService.performGoogleSearch(query);
    }
    // 停止当前ai回答
    @Public()
    @Get('stop-ai')
    async stopAi(@Query('conversationId') conversationId: string): Promise<any> {
        const controller = this.aiService.activeControllers.get(conversationId); // 获取控制器
        if (controller) {
            controller.abort(); // 停止流式请求
            this.aiService.activeControllers.delete(conversationId); // 从 Map 中删除
            this.aiTtsStreamService.stopTts(conversationId);
            return { message: '流式请求已成功停止' };
        }

        return { message: '未找到正在进行的流式请求' };
    }

    // 前端只传 fileId 或 filePath
    @Public()
    @Post('transcribe')
    async transcribe(@Body('id', new ParseIntPipe()) id: number) {
        // 查询文件信息
        console.log('id:', id);
        const file = await this.filelistService.findById(id);
        console.log('file:：：：：：：', file);
        if (!file) throw new Error('文件不存在');
        // 调用模型识别
        const text = await this.AiComSttService.transcribe((file as any).filePath);
        return { text };
    }

    // 新增：PDF 多文件上传（字段名 pdfs，支持多个）
    // @Public()
    // @Post('upload-pdfs')
    // @UseInterceptors(FilesInterceptor('pdfs')) // 复用你已有的 Multer 配置
    // async uploadPdfs(@UploadedFiles() files: Express.Multer.File[]) {
    //     if (!files || files.length === 0) {
    //         throw new BadRequestException('未上传 PDF 文件');
    //     }
    //     return this.aiService.processPdfUploads(files, this.filelistService);
    // }
    // 修改接口
    @Public()
    @Post('upload-pdfs')
    @UseInterceptors(
        FilesInterceptor('pdfs', 10, {
            // 10 是 maxCount，可选，限制最多10个文件
            storage: diskStorage({
                destination: (req, file, cb) => {
                    const uploadPath = './uploads';
                    if (!fs.existsSync(uploadPath)) {
                        fs.mkdirSync(uploadPath, { recursive: true });
                    }
                    cb(null, uploadPath);
                },
                filename: (req, file, cb) => {
                    const filename = `${file.originalname}`; // 或加时间戳/UUID 防重名
                    cb(null, filename);
                },
            }),
            limits: { fileSize: 1024 * 1024 * 5 }, // 可选，复用你的限制
        }),
    )
    async uploadPdfs(@UploadedFiles() files: Express.Multer.File[]) {
        if (!files || files.length === 0) {
            throw new BadRequestException('未上传 PDF 文件');
        }

        return this.aiService.processPdfUploads(files, this.filelistService);
    }
}
