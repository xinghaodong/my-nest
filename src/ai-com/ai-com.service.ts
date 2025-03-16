import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, In } from 'typeorm';
import { ChatRecord } from './entities/ai-com.entity';
import { Message } from './entities/ai-com.entity';
// 导入时间查询工具
import { format } from 'date-fns';
import axios from 'axios';
@Injectable()
export class ai_testservice {
    private MODEL_PROVIDER = process.env.MODEL_PROVIDER || 'aliyun'; // aliyun 或 ollama
    private client: OpenAI;
    private tools: any = [
        // 工具1 获取当前时刻的时间
        {
            type: 'function',
            function: {
                name: 'getCurrentTime',
                description: '当你想知道现在的时间时非常有用。',
                // 因为获取当前时间无需输入参数，因此parameters为空
                parameters: {},
            },
        },
        // 工具2 获取指定城市的天气
        {
            type: 'function',
            function: {
                name: 'getCurrentWeather',
                description: '当你想查询指定城市的天气时非常有用。',
                parameters: {
                    type: 'object',
                    properties: {
                        // 查询天气时需要提供位置，因此参数设置为location
                        location: {
                            type: 'string',
                            description: '城市或县区，比如北京市、杭州市、余杭区等。',
                        },
                    },
                    required: ['location'],
                },
            },
        },
    ];
    constructor(
        @InjectRepository(ChatRecord)
        private readonly chatRecordRepository: Repository<ChatRecord>,
        @InjectRepository(Message)
        private readonly messageRepository: Repository<Message>,
    ) {
        this.client = new OpenAI({
            apiKey: process.env.ALIYUN_API_KEY,
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        });
    }
    async getCurrentWeather(args) {
        let city = args?.location || args;
        // 如果 字符串里有 '市' 则删掉 聚合api 就是这样 加上市就查不出来🙂
        if (city.includes('市')) city = city.replace('市', '');
        const apiKey = '76030359bfb467bb3fa5e9b48f252140';
        const apiUrl = `http://apis.juhe.cn/simpleWeather/query?key=${apiKey}&city=${encodeURIComponent(city)}`;

        try {
            const response = await axios.get(apiUrl);
            const weatherData = response.data;
            if (weatherData.error_code === 0) {
                const { temperature, info, direct, power, aqi } = weatherData.result.realtime;
                return `${city}的当前天气是${info}，温度为${temperature}度,${direct}${power}空气质量为${aqi}`;
            } else {
                return `无法获取${city}的天气信息。`;
            }
        } catch (error) {
            console.error('调用天气 API 失败:', error);
            return '获取天气信息时出现错误。';
        }
    }
    async getCurrentTime() {
        // 获取当前日期和时间
        const currentDatetime = new Date();
        // 格式化当前日期和时间
        const formattedTime = format(currentDatetime, 'yyyy-MM-dd HH:mm:ss');
        // 返回格式化后的当前时间
        return `当前时间：${formattedTime}。`;
    }

    /** 判断是本地模型还是服务商模型 统一处理流式请求 */
    async callModelStream(prompt: string, conversationId: string, model: string, res: any) {
        await this.saveChatRecord('user', prompt, conversationId);
        console.log('model', model);
        if (model === 'deepseek-r1:14b') {
            return this.callOllamaStream(prompt, conversationId, model, res);
        } else {
            return this.callAliyunStream(prompt, conversationId, model, res);
        }
    }
    /**
     * 本地模型调用
     */
    /** 本地 Ollama (DeepSeek-R1) 处理流式请求（带上下文记忆） */
    async callOllamaStream(prompt: string, conversationId: string, model: string, res: any) {
        console.log('使用本地 Ollama (DeepSeek-R1) 处理带上下文的请求', prompt);

        try {
            // 1. 获取对话历史记录
            const historyList = await this.getConversationHistory(conversationId, '1');
            const conversationHistory = historyList.map(item => ({
                role: item.role === 'user' ? 'user' : 'assistant',
                content: item.content,
            }));
            let messages = [
                {
                    role: 'system',
                    content: '你是一个很有帮助的助手',
                },
                ...conversationHistory,
            ];

            // 3. 调用 Ollama 的 chat 接口（注意 URL 改为 /api/chat）
            const response = await axios.post(
                'http://localhost:11434/api/chat',
                {
                    // model deepseek-r1:14b
                    model: model,
                    messages, // 使用完整的消息数组
                    stream: true,
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    responseType: 'stream',
                },
            );

            let accumulatedResponse = '';
            response.data.on('data', (chunk: Buffer) => {
                try {
                    const jsonString = chunk.toString();
                    const jsonData = JSON.parse(jsonString);

                    if (jsonData.message?.content) {
                        // 4. 累加流式响应内容
                        accumulatedResponse += jsonData.message.content;
                        res.write(`data: ${JSON.stringify(accumulatedResponse)}\n\n`);
                    }
                } catch (err) {
                    console.error('解析流数据错误:', err);
                }
            });

            response.data.on('end', async () => {
                console.log('流式响应结束');
                res.write('event: end\ndata: {}\n\n');
                res.end();

                // 5. 保存完整的响应到数据库
                if (accumulatedResponse) {
                    await this.saveChatRecord('assistant', accumulatedResponse, conversationId);
                }
            });
        } catch (error) {
            console.error('本地模型请求失败:', error);
            res.write(`data: ${JSON.stringify({ error: '本地 AI 调用失败' })}\n\n`);
            res.end();
        }
    }

    /**
     * 阿里云模型调用
     * 异步调用模型流式接口
     * 该方法将用户输入添加到对话历史中，然后调用AI模型进行响应，以流式方式返回AI的回答，并将其添加到对话历史中
     * @param prompt 用户输入的提示信息
     * @param res 用于流式返回响应的对象
     * @returns 无返回值
     */
    async callAliyunStream(prompt: string, conversationId: string, model: string, res: any) {
        console.log('使用阿里云模型处理带上下文的请求', prompt);
        let historyList = await this.getConversationHistory(conversationId, '1');
        let conversationHistory = historyList.map(item => {
            return item;
        });
        try {
            let messages = [
                {
                    role: 'system',
                    content:
                        '你是一个很有帮助的助手。如果用户提问关于天气的问题，请调用 `getCurrentWeather` 函数；如果用户提问关于时间的问题，请调用 `getCurrentTime` 函数。如果用户提到多个城市，请为每个城市分别调用 `getCurrentWeather` 函数生成独立的工具调用。支持同时查询多个城市的天气，并以友好的语气回答问题。',
                },
                ...conversationHistory,
            ];

            let accumulatedResponse = '';

            while (true) {
                const completion = await this.client.chat.completions.create({
                    // model: 'qwen-plus',
                    model: model,
                    messages,
                    tools: this.tools,
                    stream: true,
                });

                let accumulatedToolCalls = [];
                let hasToolCalls = false;

                for await (const chunk of completion) {
                    const delta = chunk.choices?.[0]?.delta;

                    if (delta?.content) {
                        accumulatedResponse += delta.content;
                        res.write(`data: ${JSON.stringify(accumulatedResponse)}\n\n`);
                    }

                    if (delta?.tool_calls) {
                        hasToolCalls = true;
                        delta.tool_calls.forEach((toolCall, index) => {
                            if (!accumulatedToolCalls[index]) {
                                accumulatedToolCalls[index] = { id: `call_${Date.now()}_${index}`, function: { name: '', arguments: '' } };
                            }
                            if (toolCall.function?.name) {
                                accumulatedToolCalls[index].function.name = toolCall.function.name;
                            }
                            if (toolCall.function?.arguments) {
                                accumulatedToolCalls[index].function.arguments += toolCall.function.arguments;
                            }
                        });
                        console.log('当前累积的工具调用:', accumulatedToolCalls);
                    }

                    if (chunk.choices?.[0]?.finish_reason === 'tool_calls' && accumulatedToolCalls.length > 0) {
                        const toolCallMessage = {
                            role: 'assistant',
                            content: null,
                            tool_calls: accumulatedToolCalls.map((call, index) => ({
                                id: call.id,
                                type: 'function',
                                function: {
                                    name: call.function.name,
                                    arguments: call.function.arguments,
                                },
                            })),
                        };

                        messages.push(toolCallMessage);
                        await this.saveChatRecord('assistant', toolCallMessage, conversationId);

                        const toolResponses = [];
                        for (const toolCall of accumulatedToolCalls) {
                            let toolResponseContent = '';
                            try {
                                const functionArgs = JSON.parse(toolCall.function.arguments);

                                if (toolCall.function.name === 'getCurrentWeather') {
                                    toolResponseContent = await this.getCurrentWeather(functionArgs);
                                } else if (toolCall.function.name === 'getCurrentTime') {
                                    toolResponseContent = await this.getCurrentTime();
                                }

                                toolResponses.push({
                                    role: 'tool',
                                    content: toolResponseContent,
                                    tool_call_id: toolCall.id,
                                });
                            } catch (error) {
                                console.error('工具调用或参数解析失败:', error);
                                toolResponseContent = '抱歉，工具调用失败，请稍后再试。';
                                toolResponses.push({
                                    role: 'tool',
                                    content: toolResponseContent,
                                    tool_call_id: toolCall.id,
                                });
                            }
                        }

                        toolResponses.forEach(response => {
                            messages.push(response);
                            // 可选：保存工具结果
                            // await this.saveChatRecord('tool', response.content, conversationId);
                        });
                    }
                }

                // 如果没有工具调用，退出循环
                if (!hasToolCalls) {
                    if (accumulatedResponse) {
                        await this.saveChatRecord('assistant', accumulatedResponse, conversationId);
                    }
                    break;
                }
                // 重置工具调用状态，准备下一次循环
                accumulatedToolCalls = [];
                hasToolCalls = false;
            }

            res.write('event: end\ndata: {}\n\n');
            res.end();
        } catch (error) {
            console.error('调用模型失败:', error);
            res.write(`data: ${JSON.stringify({ error: 'AI 调用失败' })}\n\n`);
            res.end();
        }
    }
    // 保存会话id
    async saveConversation(content: string): Promise<any> {
        const newConversation = this.chatRecordRepository.create({
            content,
        });
        let data = await this.chatRecordRepository.save(newConversation);
        return data;
    }
    async saveChatRecord(role: string, content: any, conversationId: string): Promise<void> {
        let conversation_id = Number(conversationId);
        const conversation = await this.chatRecordRepository.findOne({
            where: { conversation_id: conversation_id },
            relations: ['messages'],
        });

        conversation.modifiedTime = new Date();
        await this.chatRecordRepository.save(conversation);

        let contentToSave = content;
        if (role === 'assistant' && typeof content === 'object' && content.tool_calls) {
            // 对于 tool_calls 消息，保存完整结构，但标记为不直接展示
            contentToSave = JSON.stringify(content);
        } else if (typeof content !== 'string') {
            contentToSave = String(content); // 普通文本转为字符串
        }

        const newRecord = this.messageRepository.create({
            role,
            content: contentToSave,
            conversation, // 关联会话
        });
        await this.messageRepository.save(newRecord);
    }
    // 查询所有回话id
    async getAllConversations(): Promise<any> {
        const records = await this.chatRecordRepository.find({
            order: {
                modifiedTime: 'DESC', // 按照modifiedTime字段倒序排序
            },
        });
        return records;
    }
    // 根据回话id查询聊天记录
    async getConversationHistory(conversationId: string, type: string): Promise<any> {
        let conversationIdnum = Number(conversationId);
        const messages = await this.messageRepository.find({
            where: { conversation: { conversation_id: conversationIdnum } }, // 通过关系查询
            relations: type ? [] : ['conversation'], // 如果你需要加载 ChatRecord 详情
        });
        // 如果没有传入type 是前端的这里需要过滤数据item.role == 'tool' 以及 item.role === 'assistant' && typeof content === 'string' && content.startsWith('{')的数据
        let arr = messages.filter(item => item.role !== 'tool' && !(item.role === 'assistant' && typeof item.content === 'string' && item.content.startsWith('{')));
        return arr;
    }
}
