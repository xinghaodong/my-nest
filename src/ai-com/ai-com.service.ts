import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { PassThrough } from 'stream';

@Injectable()
export class ai_testservice {
    private client: OpenAI;
    private conversationHistory: ChatCompletionMessageParam[] = []; // 明确指定类型 维护上下文
    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.ALIYUN_API_KEY, // 确保环境变量已正确设置
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', // 根据实际情况调整
        });
    }

    async callModelStream(prompt: string, res: any): Promise<void> {
        console.log('prompt:', prompt);
        // 将用户输入添加到对话历史
        this.conversationHistory.push({ role: 'user', content: prompt });
        const stream = new PassThrough(); // 用于推送数据到前端

        try {
            const completion = await this.client.chat.completions.create({
                model: 'qwen-plus', // 或其他模型名称
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' }, // 系统提示
                    ...this.conversationHistory, // 添加完整对话历史
                ],
                stream: true, // 确保开启流式返回
                stream_options: {
                    include_usage: true,
                },
            });
            let assistantResponse = ''; // 用于拼接 AI 的完整响应
            // 每当流有数据返回时，写入 `PassThrough` 流并同时推送到控制层
            for await (const chunk of completion) {
                if (chunk.choices?.[0]?.delta?.content) {
                    const content = chunk.choices[0].delta.content;
                    assistantResponse += content; // 拼接 AI 的响应
                    // stream.write(`data: ${JSON.stringify(content)}\n\n`); // 按事件流格式推送数据
                    res.write(`data: ${content}\n\n`); // 控制层立即推送到前端
                    console.log(`流写入: ${content}`); // 打印逐步流数据
                }
            }
            // 将 AI 的完整响应添加到对话历史
            this.conversationHistory.push({ role: 'assistant', content: assistantResponse });
            stream.end(); // 结束流
        } catch (error) {
            console.error('Error calling model:', error);
            stream.emit('error', error); // 错误事件
        }

        // 确保控制层也能获取到流
        stream.on('data', (chunk: Buffer) => {
            const content = chunk.toString();
            res.write(`data: ${content}\n\n`); // 将数据逐步发送到前端
            if (res.flushHeaders) res.flushHeaders(); // 确保头部已发送
        });

        // 当流结束时关闭响应
        stream.on('end', () => {
            res.write('event: end\ndata: {}\n\n'); // 发送结束信号
            res.end(); // 结束响应
        });

        // 错误处理
        stream.on('error', err => {
            console.error('流式数据发生错误', err);
            res.write(`data: ${JSON.stringify({ error: 'AI 调用失败' })}\n\n`);
            res.end();
        });
    }
}
