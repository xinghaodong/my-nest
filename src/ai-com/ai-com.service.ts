import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, In } from 'typeorm';
import { ChatRecord } from './entities/ai-com.entity';
import { Message } from './entities/ai-com.entity';
// 导入时间查询工具
import { format } from 'date-fns';
import axios from 'axios';
import { Ollama } from 'ollama';
import { AbortController } from 'node-abort-controller'; // 注意安装这个包
import { AiTtsStreamService } from './ai-tts-stream.service';
import * as fs from 'fs';
import { ChromaClient, EmbeddingFunction } from 'chromadb';
import { FilelistService } from '../filelist/filelist.service';
import { FileList as AppFileList } from '../filelist/entities/filelist.entity'; // 用别名避免冲突
import { PDFParse } from 'pdf-parse';
const controller = new AbortController();
/**
 * 本地大模型服务 可以用 node 安装 ollama 也可以自定义客户端访问 直接调用本机的ollama服务
 */
@Injectable()
export class ai_testservice {
    // 在类内部添加属性
    private chromaClient: any;
    private collection: any;
    private pdfEmbeddingFunction: any;
    private readonly embeddingModel = 'nomic-embed-text'; // 可改成你喜欢的 embedding 模型
    private summaryCollection: any; // Layer 1: 文件摘要集合
    private ollamaClient: Ollama;
    private client: OpenAI;
    public activeControllers = new Map<string, AbortController>();
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
    // private pdfEmbeddingFunction: EmbeddingFunction<string>;
    constructor(
        @InjectRepository(ChatRecord)
        private readonly chatRecordRepository: Repository<ChatRecord>,
        @InjectRepository(Message)
        private readonly messageRepository: Repository<Message>,
        private readonly aiTtsStreamService: AiTtsStreamService,
    ) {
        this.client = new OpenAI({
            apiKey: process.env.ALIYUN_API_KEY,
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        });
        console.log('ollamaClient', process.env.OLLAMA_HOST);
        // 创建自定义 Ollama 客户端，本地电脑的 Tailscale IP
        this.ollamaClient = new Ollama({
            host: `http://${process.env.OLLAMA_HOST || '127.0.0.1'}:11434`,
        });
        this.chromaClient = new ChromaClient({
            host: '127.0.0.1',
            port: 8000,
            ssl: false,
        });

        this.pdfEmbeddingFunction = {
            embed: async (texts: string[]) => {
                const response = await this.ollamaClient.embed({
                    model: this.embeddingModel, // 'nomic-embed-text'
                    input: texts,
                });
                return response.embeddings; // 返回 number[][]
            },
        };
    }

    // 获取摘要集合（Layer 1）
    private async getSummaryCollection() {
        if (!this.summaryCollection) {
            this.summaryCollection = await this.chromaClient.getOrCreateCollection({
                name: 'file_summaries', // 专门存文件摘要
                embeddingFunction: this.pdfEmbeddingFunction,
                metadata: { 'hnsw:space': 'cosine' },
            });
        }
        return this.summaryCollection;
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

    private async getCollection() {
        if (!this.collection) {
            // getOrCreateCollection 在 JS 客户端是异步的
            this.collection = await this.chromaClient.getOrCreateCollection({
                name: 'pdf_collection',
                embeddingFunction: this.pdfEmbeddingFunction, // 直接传对象
                metadata: { 'hnsw:space': 'cosine' }, // 可选
            });
        }
        return this.collection;
    }

    // 新增：处理 PDF 上传（提取文本、分块、embedding、存 Chroma）
    async processPdfUploads(files: Express.Multer.File[], filelistService: FilelistService) {
        const results = [];

        for (const file of files) {
            console.log(file, 'file');
            try {
                const fileEntity = new AppFileList();
                fileEntity.fileName = file.filename || file.originalname;
                fileEntity.contentType = file.mimetype;
                fileEntity.fileSize = file.size;
                fileEntity.filePath = file.path.replace(/\\/g, '/');
                const savedFile = await filelistService.saveFile(fileEntity);
                // const pdfParse: (data: Buffer) => Promise<{ text: string }> = require('pdf-parse');
                const fileBuffer = fs.readFileSync(file.path);
                const parser = new PDFParse({ data: fileBuffer });
                const pdfData = await parser.getText();
                console.log(pdfData, 'pdfData');

                // const pdfData = await pdfParse.default(fileBuffer);
                let fullText = pdfData.text;
                console.log(fullText, 'fullText');

                // 如果文本太长或需要更好分块，可以在这里进一步处理
                // 简单分块（每 1000 字符一块）
                const chunkSize = 1000;
                const chunks: string[] = [];
                const overlap = 200;
                for (let i = 0; i < fullText.length; i += chunkSize - overlap) {
                    chunks.push(fullText.substring(i, i + chunkSize));
                }

                if (chunks.length === 0) {
                    results.push({ fileId: savedFile.id, status: 'empty' });
                    continue;
                }
                console.log('使用 Ollama 生成 embeddings');
                // 4. 使用 Ollama 生成 embeddings
                const embedResponse = await this.ollamaClient.embed({
                    model: this.embeddingModel,
                    input: chunks,
                });
                const embeddings = embedResponse.embeddings;

                // ---------------- Layer 1: 生成并存储文件摘要 ----------------
                // 生成摘要（取前4000字符给LLM读，生成简短描述）
                const summaryPrompt = `请简要总结以下文件内容，作为检索索引。重点描述文件包含的关键主题和实体。\n\n内容前4000字：\n${fullText.substring(0, 4000)}`;
                const summaryResponse = await this.ollamaClient.chat({
                    model: 'gemma2:2b', // 使用轻量级模型生成摘要
                    messages: [{ role: 'user', content: summaryPrompt }],
                    stream: false,
                });
                const summaryText = summaryResponse.message.content;
                console.log(`文件 [${file.originalname}] 摘要:`, summaryText);

                // 存入 Summary Collection
                const summaryCollection = await this.getSummaryCollection();
                const summaryEmbed = await this.ollamaClient.embed({
                    model: this.embeddingModel,
                    input: summaryText,
                });
                await summaryCollection.add({
                    ids: [`file_summary_${savedFile.id}`],
                    embeddings: summaryEmbed.embeddings,
                    documents: [summaryText],
                    metadatas: [{ fileId: savedFile.id, fileName: file.originalname }],
                });
                // -------------------------------------------------------------

                // 5. 存入 Chroma (Chunks)
                const collection = await this.getCollection();
                const ids = chunks.map((_, idx) => `${savedFile.id}_chunk_${idx}`);
                await collection.add({
                    ids,
                    embeddings,
                    documents: chunks,
                    metadatas: chunks.map(() => ({
                        source: file.originalname,
                        fileId: savedFile.id,
                    })),
                });

                results.push({ fileId: savedFile.id, chunks: chunks.length, status: 'success' });
            } catch (error) {
                console.error(`处理文件 ${file.originalname} 失败:`, error);
                results.push({ file: file.originalname, status: 'error', error: error.message });
            }
        }

        return { message: 'PDF 处理完成（已生成摘要路由）', results };
    }

    // ---------------- Layer 1: 文件路由 (File Routing) ----------------
    async routeQueryToFiles(query: string): Promise<number[]> {
        console.log('--- Layer 1: File Routing ---');
        try {
            const summaryCollection = await this.getSummaryCollection();
            const queryEmbed = await this.ollamaClient.embed({
                model: this.embeddingModel,
                input: query,
            });

            // 检索最相关的 3 个文件
            const results = await summaryCollection.query({
                queryEmbeddings: queryEmbed.embeddings,
                nResults: 3,
            });

            const relevantFileIds = new Set<number>();
            if (results.metadatas[0]) {
                results.metadatas[0].forEach((meta: any, idx) => {
                    // 相似度阈值过滤（距离越小越相似，cosine distance）
                    if (results.distances[0][idx] < 0.6) {
                        console.log(`命中文件: ${meta.fileName} (ID: ${meta.fileId}), 距离: ${results.distances[0][idx]}`);
                        relevantFileIds.add(meta.fileId);
                    }
                });
            }
            return Array.from(relevantFileIds);
        } catch (error) {
            console.error('File Routing Error:', error);
            return []; // 如果路由失败，降级为搜索所有
        }
    }

    // ---------------- Layer 3: 结构化压缩 (Structured Compression) ----------------
    async compressContext(query: string, rawChunks: string[]): Promise<string> {
        if (rawChunks.length === 0) return '';
        console.log('--- Layer 3: Structured Compression ---');

        const contextBlock = rawChunks.join('\n\n---\n\n');
        const compressionPrompt = `
你是一个专业的RAG生成助手。你的任务是根据用户的查询，从以下检索到的原始片段中提取关键对答信息，并进行结构化整理。
不要直接复制原文，要提炼核心事实。如果片段中没有相关信息，请忽略。

用户查询: "${query}"

原始片段:
${contextBlock}

请输出“结构化上下文”：`;
        console.log('压缩上下文:', compressionPrompt);
        try {
            const response = await this.ollamaClient.chat({
                model: 'gemma2:2b', // 用一个小模型做中间处理，速度快
                messages: [{ role: 'user', content: compressionPrompt }],
                stream: true,
            });
            let compressed = '';
            for await (const chunk of response) {
                console.log('压缩chunk:', chunk);
                if (chunk.message?.content) {
                    compressed += chunk.message.content;
                }
            }
            console.log('压缩后的上下文长度:', compressed.length);
            return compressed;
        } catch (error) {
            console.error('Compression Error:', error);
            return contextBlock; // 降级：直接返回原文
        }
    }

    shouldEnableWebSearch(prompt: string, conversationHistory: any[]): boolean {
        // 规则 1: 关键词匹配
        const realTimeKeywords = ['今天', '最新', '2023', '新闻', '最近', '现在', '当前'];
        const hasRealTimeKeyword = realTimeKeywords.some(keyword => prompt.includes(keyword));

        // 规则 2: 问题类型
        const factualKeywords = ['哪里', '什么时候', '多少', '为什么', '如何'];
        const isFactualQuestion = factualKeywords.some(keyword => prompt.includes(keyword));

        // 规则 3: 上下文分析
        const lastMessage = conversationHistory[conversationHistory.length - 1];
        const isFollowUpQuestion = lastMessage && lastMessage.content.includes('最新');

        // 规则 4: 历史记录
        const hasWebSearchHistory = conversationHistory.some(item => item.role === 'assistant' && item.content.includes('[网络搜索]'));

        // 规则 5: 本地知识库（简单示例）
        // const localKnowledgeQuestions = ['你好', '谢谢'];
        // const isLocalKnowledgeQuestion = localKnowledgeQuestions.includes(prompt.trim());

        // 综合判断
        return hasRealTimeKeyword || isFactualQuestion || isFollowUpQuestion || hasWebSearchHistory;
    }

    // 自定义搜索方法
    async performGoogleSearch(query: string): Promise<string> {
        const apiKey = '5bb50bfb03899ead0850b9a197851082e1ddf557';
        const url = 'https://google.serper.dev/search';

        try {
            const response = await axios.post(
                url,
                {
                    q: query,
                    gl: 'cn', // 国家：中国
                    hl: 'zh-cn', // 语言：简体中文
                    num: 5, // 结果数量
                },
                {
                    headers: {
                        'X-API-KEY': apiKey,
                        'Content-Type': 'application/json',
                    },
                },
            );
            const results = response.data.organic;
            // console.log('results', results);
            // 返回一个数组，每个元素包含标题、描述和链接
            return results.slice(0, 5).map((item: any) => ({
                title: item.title,
                snippet: item.snippet,
                link: item.link,
            }));
        } catch (error) {
            console.error('Serper 搜索失败:', error);
            throw new Error('搜索服务暂时不可用，请稍后重试');
        }
    }

    /** 判断是本地模型还是服务商模型 统一处理流式请求 */
    async callModelStream(prompt: string, conversationId: string, model: string, useInternetSearch: string, useRag: string, res: any) {
        await this.saveChatRecord('user', prompt, conversationId);
        if (model === 'qwen-plus') {
            return this.callAliyunStream(prompt, conversationId, model, useInternetSearch, useRag, res);
        } else {
            return this.callOllamaStream(prompt, conversationId, model, useInternetSearch, useRag, res);
        }
    }
    /**
     * 本地模型调用
     */
    /** 本地 Ollama (例如:DeepSeek-R1等开源模型) 处理流式请求（带上下文记忆、联网搜索功能） */
    async callOllamaStream(prompt: string, conversationId: string, model: string, useInternetSearch: string, useRag: string, res: any) {
        console.log(`使用本地 Ollama (${model}) useRag:${useRag} 处理带上下文的请求`, prompt);

        let accumulatedResponse = '';
        try {
            // 1. 获取对话历史记录  这里需要对历史数据进行处理 不然会超出上下文导致ollama无法处理
            const historyList = await this.getConversationHistory(conversationId, '1');
            const conversationHistory = historyList.map(item => ({
                role: item.role === 'user' ? 'user' : 'assistant',
                content: item.content,
            }));
            const controller = new AbortController();
            const { signal } = controller;
            this.activeControllers.set(conversationId, controller); // 保存控制器

            // 2. 判断是否需要联网搜索
            const shouldSearch = this.shouldEnableWebSearch(prompt, conversationHistory);
            let searchContext = '';

            if (shouldSearch && useInternetSearch === '1') {
                res.write(`data: ${JSON.stringify({ status: 'searching', message: '正在进行联网搜索...' })}\n\n`);
                try {
                    const searchResultsArray = await this.performGoogleSearch(prompt); // 假设返回多个搜索结果的数组
                    if (Array.isArray(searchResultsArray) && searchResultsArray.length > 0) {
                        searchContext = '\n\n[网络搜索上下文]（更新时间：' + new Date().toLocaleString() + '）\n';
                        console.log('searchResultsArray:', searchResultsArray);

                        searchResultsArray.forEach((result, index) => {
                            searchContext += `【结果 ${index + 1}】\n标题：${result.title}\n描述：${result.snippet}\n来源：${result.link}\n\n`;
                        });
                        console.log('searchContext:', searchContext);
                    }
                    res.write(`data: ${JSON.stringify({ status: 'search_complete', message: '联网搜索完成' })}\n\n`);
                } catch (searchError) {
                    console.error('联网搜索失败:', searchError);
                    searchContext = '\n\n[注意：当前网络搜索不可用，将仅使用本地知识库回答]';
                    res.write(`data: ${JSON.stringify({ status: 'search_failed', message: '联网搜索失败，将仅使用本地知识库回答' })}\n\n`);
                }
            }
            let ragContext = '';
            // 新增：如果启用 RAG，则检索相关片段
            if (useRag == '1') {
                try {
                    // --- Layer 1: File Routing ---
                    const targetFileIds = await this.routeQueryToFiles(prompt);
                    let whereFilter = undefined;

                    if (targetFileIds.length > 0) {
                        console.log(`路由定位到 ${targetFileIds.length} 个文件:`, targetFileIds);
                        // ChromaDB where filter: { key: { $in: [val1, val2] } }
                        // 注意：Chroma 的 where 过滤 fileId 必须是存储时的类型。
                        // 我们存的是 number, 但 chroma metadata 有时处理 quirky。
                        // 建议之前存的时候确认是 number。这里我们构建 $in 查询。
                        if (targetFileIds.length === 1) {
                            whereFilter = { fileId: targetFileIds[0] };
                        } else {
                            whereFilter = { fileId: { $in: targetFileIds } };
                        }
                    } else {
                        console.log('未路由到特定文件，将进行全局检索 (Layer 1 Miss)');
                    }

                    // --- Layer 2: Chunk Retrieval (Filtered) ---
                    const collection = await this.getCollection();
                    const queryEmbed = await this.ollamaClient.embed({
                        model: this.embeddingModel,
                        input: prompt,
                    });
                    const queryEmbedding = queryEmbed.embeddings[0];
                    console.log('queryEmbedding', queryEmbedding);
                    const results = await collection.query({
                        queryEmbeddings: [queryEmbedding],
                        nResults: 20, // 检索多一点，给 Layer 3 挑选
                        where: whereFilter, // 核心：加上文件过滤
                        include: ['documents', 'metadatas', 'distances'],
                    });

                    const rawChunks: string[] = [];
                    if (results.documents[0] && results.documents[0].length > 0) {
                        results.documents[0].forEach((doc: string, idx: number) => {
                            const distance = results.distances[0][idx];
                            if (distance < 0.45) {
                                // 放宽一点阈值，因为我们会做压缩
                                const meta = results.metadatas[0][idx];
                                rawChunks.push(`【来源：${meta.source}】\n${doc}`);
                            }
                        });
                    }

                    // --- Layer 3: Structured Compression ---
                    if (rawChunks.length > 0) {
                        ragContext = await this.compressContext(prompt, rawChunks);
                    } else {
                        ragContext = '\n[知识库中未找到相关信息，使用普通对话]';
                    }
                } catch (error) {
                    console.error('RAG 检索失败:', error);
                    ragContext = '\n[注意：PDF 知识库检索出错，将仅使用本地知识库回答]\n';
                }
            }

            const systemContent = `请使用中文回答,` + ragContext;
            console.log('systemContent:', ragContext);
            // 3. 构造消息
            const messages = [
                {
                    role: 'system',
                    content: systemContent,
                },
                ...conversationHistory,
                { role: 'user', content: prompt },
            ];
            // 3. 调用 Ollama 的 chat 接口
            //  'http://localhost:11434/api/chat',
            const completion = await this.ollamaClient.chat({ model: model, messages, stream: true, signal } as any);
            console.log('模型:', model);
            let sentenceBuffer = '';

            for await (const chunk of completion) {
                if (signal.aborted) {
                    throw new Error('Request Aborted');
                }
                console.log('chunk:', chunk);
                if (chunk.message?.content) {
                    accumulatedResponse += chunk.message.content;
                    sentenceBuffer += chunk.message.content;
                    //  正常文字流
                    if (chunk.message?.content) {
                        res.write(
                            `data: ${JSON.stringify({
                                type: 'content', // 明确类型之后扩展思考的模式
                                text: chunk.message.content,
                            })}\n\n`,
                        );
                    }
                    // res.write(`data: ${JSON.stringify(accumulatedResponse)}\n\n`);
                    // 只要检测到一句话结尾 → 立刻 TTS 可以加上.
                    // if (sentenceBuffer.match(/[。！？.!?]/)) {
                    //     console.log('ttsText:', sentenceBuffer);
                    //     const ttsText = sentenceBuffer;
                    //     sentenceBuffer = '';
                    //     const audioBase64 = await this.aiTtsStreamService.tts(ttsText);
                    //     if (audioBase64) {
                    //         res.write(
                    //             `data: ${JSON.stringify({
                    //                 type: 'audio',
                    //                 // 加上前缀，明确是 data URL（前端最简单判断）
                    //                 audio: `data:audio/mp3;base64,${audioBase64}`,
                    //             })}\n\n`,
                    //         );
                    //     }
                    // }
                }
            }
            // for await (const chunk of completion) {
            //     if (signal.aborted) {
            //         // 检查是否已中止
            //         throw new Error('Request Aborted'); // 强制抛出错误
            //     }

            //     if (chunk.message) {
            //         console.log('chunk', chunk);
            //         if ((chunk.message as any).thinking) {
            //             accumulatedResponse += (chunk.message as any).thinking;
            //             res.write(`data: ${JSON.stringify({ status: 'thinking', message: accumulatedResponse })}\n\n`);
            //         } else {
            //             accumulatedResponse += chunk.message.content;
            //             // console.log('chunk', accumulatedResponse);
            //             res.write(`data: ${JSON.stringify(accumulatedResponse)}\n\n`);
            //         }
            //     }
            // }
            if (accumulatedResponse) {
                console.log('全量响应:', accumulatedResponse);
                await this.saveChatRecord('assistant', accumulatedResponse, conversationId);
            }
            res.write('event: end\ndata: {}\n\n');
            res.end();
        } catch (error) {
            if (error.message === 'Request Aborted') {
                console.log(`流式请求已被手动停止 (ID: ${conversationId})`);
                // 即使是手动中止也要保存到数据库
                if (accumulatedResponse) {
                    await this.saveChatRecord('assistant', accumulatedResponse, conversationId);
                }
                res.write('event: end\ndata: {已经被用户手动取消}\n\n');
            } else {
                console.error('本地模型请求失败:', error);
                res.write(`data: ${JSON.stringify({ error: '本地 AI 调用失败' })}\n\n`);
            }
        } finally {
            this.activeControllers.delete(conversationId); // 请求完成后删除控制器
        }
    }

    /**
     * 阿里云模型调用
     * 异步调用模型流式接口
     * 该方法将用户输入添加到对话历史中，然后调用AI模型进行响应，以流式方式返回AI的回答，并将其添加到对话历史中,增加工具调用
     * @param prompt 用户输入的提示信息
     * @param res 用于流式返回响应的对象
     * @returns 无返回值
     */
    async callAliyunStream(prompt: string, conversationId: string, model: string, useInternetSearch: string, useRag: string, res: any) {
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
    // 保存聊天记录
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
            isCompleted: role === 'assistant' ? '1' : '',
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
    // 查询本地ollama模型
    async getOllamaModels(): Promise<any> {
        try {
            console.log('开始查询本地ollama模型', process.env.OLLAMA_HOST, this.ollamaClient);
            let models = await this.ollamaClient.list();
            return models.models;
        } catch (error) {
            throw new HttpException('本地模型加载失败', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
