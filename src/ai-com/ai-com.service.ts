import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, In } from 'typeorm';
import { ChatRecord } from './entities/ai-com.entity';
import { Message } from './entities/ai-com.entity';
import { v4 as uuidv4 } from 'uuid'; // 引入 UUID 库
import { json } from 'stream/consumers';
import { console } from 'inspector';

// import { PassThrough } from 'stream';

@Injectable()
export class ai_testservice {
    private client: OpenAI;
    private conversationHistory: ChatCompletionMessageParam[] = []; // 维护上下文对话历史
    constructor(
        @InjectRepository(ChatRecord)
        private readonly chatRecordRepository: Repository<ChatRecord>,
        @InjectRepository(Message)
        private readonly messageRepository: Repository<Message>,
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
    async callModelStream(prompt: string, conversationId: string, res: any): Promise<void> {
        // 将用户输入添加到对话历史
        console.log(`用户输入: ${prompt}`, conversationId);
        this.conversationHistory.push({ role: 'user', content: prompt });
        // 保存用户的消息记录
        await this.saveChatRecord('user', prompt, conversationId);
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
            // 调用消息保存接口
            let accumulatedResponse = ''; // 用于累积 AI 的完整响应
            // 每当流有数据返回时，拼接完整响应并发送全量数据
            for await (const chunk of completion) {
                if (chunk.choices?.[0]?.delta?.content) {
                    const content = chunk.choices[0].delta.content;
                    // 累积完整的 AI 响应
                    accumulatedResponse += content;
                    // 发送全量数据到前端
                    res.write(`data: ${JSON.stringify(accumulatedResponse)}\n\n`);
                }
            }
            // 将 AI 的完整响应添加到对话历史
            // this.conversationHistory.push({ role: 'assistant', content: accumulatedResponse });
            console.log(`完整响应: ${accumulatedResponse}`);
            // 发送结束信号
            res.write('event: end\ndata: {}\n\n');
            res.end(); // 结束响应
            // 把完整的相应保存在数据库里
            await this.saveChatRecord('assistant', accumulatedResponse, conversationId);
        } catch (error) {
            res.write(`data: ${JSON.stringify({ error: 'AI 调用失败' })}\n\n`);
            res.end();
        }
    }

    // 保存会话id
    async saveConversation(conversationId: string): Promise<void> {
        const newConversation = this.chatRecordRepository.create({
            conversation_random_id: conversationId,
        });
        await this.chatRecordRepository.save(newConversation);
    }
    // 存储聊天记录
    async saveChatRecord(role: string, content: string, conversationId: string): Promise<void> {
        console.log(conversationId, 'conversationIdconversationIdconversationId');
        let conversation_id = Number(conversationId);
        const conversation = await this.chatRecordRepository.findOne({
            where: { conversation_id: conversation_id },
            relations: ['messages'], // 预加载关联的 messages
        });

        // 更新父表时间
        conversation.modifiedTime = new Date();
        await this.chatRecordRepository.save(conversation);
        // 保存子表记录
        const newRecord = this.messageRepository.create({
            role,
            content,
            conversation: conversation, // 关键：建立关系
        });
        await this.messageRepository.save(newRecord);
    }
    // 查询历史记录
    // async getChatHistory(conversationId: string): Promise<ChatRecord[]> {
    //     const options: FindManyOptions<ChatRecord> = {
    //         where: { conversationId },
    //         order: { created_at: 'ASC' },
    //     };
    //     const records = await this.chatRecordRepository.find(options);
    //     return records;
    // }
    // 查询所有回话id
    async getAllConversations(): Promise<any> {
        const records = await this.chatRecordRepository.find();
        return records;
    }
    // 根据回话id查询聊天记录
    async getConversationHistory(conversationId: number): Promise<any> {
        const messages = await this.messageRepository.find({
            where: { conversation: { conversation_id: conversationId } }, // 通过关系查询
            // relations: ['conversation'], // 如果你需要加载 ChatRecord 详情
        });
        return messages;
    }
}
