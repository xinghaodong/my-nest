import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { ChatRecord } from './entities/ai-com.entity';
import { v4 as uuidv4 } from 'uuid'; // 引入 UUID 库

// import { PassThrough } from 'stream';

@Injectable()
export class ai_testservice {
    private client: OpenAI;
    private conversationHistory: ChatCompletionMessageParam[] = []; // 维护上下文对话历史
    constructor(
        @InjectRepository(ChatRecord)
        private readonly chatRecordRepository: Repository<ChatRecord>,
    ) {
        this.client = new OpenAI({
            apiKey: process.env.ALIYUN_API_KEY, // 确保环境变量已正确设置
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', // 根据实际情况调整
        });
    }
    /**
     * 异步调用模型流式接口
     * 该方法将用户输入添加到对话历史中，然后调用AI模型进行响应，以流式方式返回AI的回答，并将其添加到对话历史中
     * @param prompt 用户输入的提示信息
     * @param res 用于流式返回响应的对象
     * @returns 无返回值
     */
    async callModelStream(prompt: string, res: any): Promise<void> {
        // 将用户输入添加到对话历史
        this.conversationHistory.push({ role: 'user', content: prompt });
        try {
            const completion = await this.client.chat.completions.create({
                model: 'qwen-plus', // 或其他模型名称
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' }, // 系统提示
                    ...this.conversationHistory, // 添加完整对话历史
                ],
                stream: true, // 开启流式返回
                stream_options: {
                    include_usage: true,
                },
            });
            let accumulatedResponse = ''; // 用于累积 AI 的完整响应
            // 每当流有数据返回时，拼接完整响应并发送全量数据
            for await (const chunk of completion) {
                if (chunk.choices?.[0]?.delta?.content) {
                    const content = chunk.choices[0].delta.content;
                    // 累积完整的 AI 响应
                    accumulatedResponse += content;
                    // 发送全量数据到前端
                    res.write(`data: ${JSON.stringify(accumulatedResponse)}\n\n`);
                    console.log(`流写入: ${accumulatedResponse}`); // 打印逐步流数据
                }
            }
            // 将 AI 的完整响应添加到对话历史
            this.conversationHistory.push({ role: 'assistant', content: accumulatedResponse });
            // 发送结束信号
            res.write('event: end\ndata: {}\n\n');
            res.end(); // 结束响应
        } catch (error) {
            res.write(`data: ${JSON.stringify({ error: 'AI 调用失败' })}\n\n`);
            res.end();
        }
    }
    // 存储聊天记录
    async saveChatRecord(role: string, content: string, conversationId: string): Promise<void> {
        const newRecord = this.chatRecordRepository.create({
            role,
            content,
            conversationId,
        });
        await this.chatRecordRepository.save(newRecord);
        console.log(`历史记录保存: ${role} - ${content}`);
    }
}
