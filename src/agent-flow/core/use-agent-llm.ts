import * as fs from 'fs';
import * as path from 'path';

/**
 * 🤖 AI 智能体统一大模型驱动 Hook / 工具函数 (类似于 Vue3 的 useXxx 组合式函数)
 * 封装：统一多提供商适配 (智谱 GLM-4 / 本地 Ollama)、自动超时与降级容错、JSON 安全解析清洗与结构化日志
 */

export interface LlmCallOptions {
    temperature?: number;
    timeoutMs?: number;
    model?: string;
    preferredProvider?: 'zhipu' | 'ollama';
    keepAlive?: string | number;
}

export interface UseAgentLlmReturn {
    callModelApi: (systemPrompt: string, userPrompt: string, options?: LlmCallOptions) => Promise<string>;
    callZhipuDirect: (systemPrompt: string, userPrompt: string, options?: LlmCallOptions) => Promise<string>;
    callOllamaDirect: (systemPrompt: string, userPrompt: string, options?: LlmCallOptions) => Promise<string>;
    parseModelJson: <T = any>(rawText: string) => T;
    cleanJsonOutput: (rawText: string) => string;
    getOllamaBaseUrl: () => string;
}

/**
 * 组合式大模型调用 Hook: useAgentLlm
 * @param roleTag 当前调用的智能体角色标签 (用于日志标识，如 "发票初审专员" 或 "部门预算管控专员")
 */
export function useAgentLlm(roleTag: string = 'AI智能体'): UseAgentLlmReturn {
    /**
     * 实时读取最新的环境变量 (即使不重启 Node 进程，修改 .env.development 也能立刻生效！)
     */
    function getFreshEnv(key: string, defaultVal: string = ''): string {
        try {
            const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
            const envPath = path.resolve(process.cwd(), envFile);
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf8');
                const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
                if (match && match[1] !== undefined) {
                    return match[1].trim().replace(/^['"]|['"]$/g, '');
                }
            }
        } catch (e) {
            // 忽略文件读取异常，降级到 process.env
        }
        return process.env[key] || defaultVal;
    }

    /**
     * 获取 Ollama 地址并标准化
     */
    function getOllamaBaseUrl(): string {
        let host = getFreshEnv('OLLAMA_CLIENT_HOST') || getFreshEnv('OLLAMA_HOST') || getFreshEnv('AI_BD_BASE_URL') || 'http://127.0.0.1:11434';
        if (host === '0.0.0.0' || host === '::') {
            host = 'http://127.0.0.1:11434';
        }
        if (!host.startsWith('http://') && !host.startsWith('https://')) {
            host = `http://${host}`;
        }
        if (!/:\d+$/.test(host)) {
            host = `${host}:11434`;
        }
        return host.replace(/\/+$/, '');
    }

    /**
     * 直接调用智谱 AI (GLM-4 / GLM-4-flash) - 直接非流式返回
     */
    async function callZhipuDirect(systemPrompt: string, userPrompt: string, options?: LlmCallOptions): Promise<string> {
        const apiKey = getFreshEnv('ZHIPU_API_KEY') || '6c13192ca1df4e8d8f4ab2f5caa0011f.0xI3XkLDeFX6U4qA';
        const modelName = options?.model || getFreshEnv('AI_ZP_DEFAULT_MODEL') || 'glm-4-flash';
        const timeoutMs = options?.timeoutMs || 40000;

        console.log(`🌐 [useAgentLlm:${roleTag}] 正在发起智谱 GLM 调用 -> 模型: ${modelName} (超时: ${timeoutMs / 1000}秒)`);
        const startTime = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: options?.temperature ?? 0.1,
                    stream: false, // 🌟 采用直接非流式返回，彻底杜绝并发乱码！
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`智谱 API 响应错误: ${response.status} - ${errText}`);
            }

            const data: any = await response.json();
            const fullContent = data.choices?.[0]?.message?.content || '';
            const duration = Date.now() - startTime;

            console.log(`\n==================== 🤖 [${roleTag} 智谱思考与决策原话 (耗时: ${duration}ms)] ====================`);
            console.log(fullContent.trim());
            console.log(`==================================================================================\n`);

            return fullContent;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                throw new Error(`智谱模型 [${modelName}] 推理超时 (超过 ${timeoutMs / 1000}秒)`);
            }
            throw error;
        }
    }

    /**
     * 直接调用本地 / 远程 Ollama - 直接非流式返回
     */
    async function callOllamaDirect(systemPrompt: string, userPrompt: string, options?: LlmCallOptions): Promise<string> {
        const ollamaHost = getOllamaBaseUrl();
        const modelName = options?.model || getFreshEnv('AI_BD_DEFAULT_MODEL') || 'gemma3:4b';
        const timeoutMs = options?.timeoutMs || Number(getFreshEnv('AI_OLLAMA_TIMEOUT_MS')) || 120000;

        console.log(`🌐 [useAgentLlm:${roleTag}] 正在发起本地 Ollama 调用 -> 地址: ${ollamaHost}, 模型: ${modelName} (超时: ${timeoutMs / 1000}秒)`);
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const keepAlive = options?.keepAlive || getFreshEnv('AI_OLLAMA_KEEP_ALIVE') || '5m';
        const numCtx = Number(getFreshEnv('AI_OLLAMA_NUM_CTX')) || 2048;

        try {
            const response = await fetch(`${ollamaHost}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    stream: false, // 🌟 采用直接非流式返回，彻底杜绝并发乱码！
                    keep_alive: keepAlive === '0' ? 0 : keepAlive,
                    options: {
                        temperature: options?.temperature ?? 0.1,
                        num_ctx: numCtx, // 🌟 动态上下文窗口 (推荐 >= 4096 防止长单据推理截断)
                        num_predict: 2048, // 🌟 允许生成的最大 token 数，确保完整输出完整 JSON
                    },
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errDetail = await response.text().catch(() => '');
                throw new Error(`Ollama 响应错误: ${response.status} ${response.statusText} ${errDetail ? `(${errDetail.trim()})` : ''}`);
            }

            const data: any = await response.json();
            const fullContent = data.message?.content || '';
            const duration = Date.now() - startTime;

            console.log(`\n==================== 🤖 [${roleTag} 本地Ollama 思考与决策原话 (耗时: ${duration}ms)] ====================`);
            console.log(fullContent.trim());
            console.log(`==================================================================================\n`);

            return fullContent;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
                throw new Error(`Ollama 模型 [${modelName}] 推理超时 (超过 ${timeoutMs / 1000}秒)`);
            }
            throw error;
        }
    }

    /**
     * 统一大模型分发入口 (优先遵循 MODEL_PROVIDER，支持自动降级)
     */
    async function callModelApi(systemPrompt: string, userPrompt: string, options?: LlmCallOptions): Promise<string> {
        // 实时从 .env.development 读取 MODEL_PROVIDER，秒级热响应！
        const provider = (options?.preferredProvider || getFreshEnv('MODEL_PROVIDER') || 'zhipu').toLowerCase();
        const zhipuKey = getFreshEnv('ZHIPU_API_KEY') || '6c13192ca1df4e8d8f4ab2f5caa0011f.0xI3XkLDeFX6U4qA';

        let result = '';

        // 🌟 选项 A: 如果配置为 ollama，优先走本地 Ollama 流式！
        if (provider === 'ollama') {
            try {
                result = await callOllamaDirect(systemPrompt, userPrompt, options);
            } catch (ollamaErr) {
                if (zhipuKey) {
                    console.warn(`⚠️ [useAgentLlm:${roleTag}] Ollama 调用异常 (${ollamaErr.message})，正在尝试降级到智谱 GLM:`, ollamaErr);
                    result = await callZhipuDirect(systemPrompt, userPrompt, options);
                } else {
                    throw ollamaErr;
                }
            }
        } else {
            // 🌟 选项 B: 优先使用智谱 AI (GLM-4 / GLM-4-flash) 流式！
            if (zhipuKey) {
                try {
                    result = await callZhipuDirect(systemPrompt, userPrompt, options);
                } catch (zhipuErr) {
                    console.warn(`⚠️ [useAgentLlm:${roleTag}] 智谱模型调用异常 (${zhipuErr.message})，正在尝试降级到本地 Ollama:`, zhipuErr);
                    result = await callOllamaDirect(systemPrompt, userPrompt, options);
                }
            } else {
                result = await callOllamaDirect(systemPrompt, userPrompt, options);
            }
        }

        return result;
    }

    /**
     * 提取纯净 JSON 字符串
     */
    function cleanJsonOutput(rawText: string): string {
        let clean = (rawText || '').trim();
        clean = clean.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        const firstBrace = clean.indexOf('{');
        if (firstBrace !== -1) {
            clean = clean.substring(firstBrace);
        }

        // 🌟 1. 容错修复未闭合的字符串 (Unterminated String)
        // 统计未转义双引号数量，如果是奇数，说明结尾被截断在字符串内部，自动补齐闭合双引号
        const quotesCount = (clean.match(/(?<!\\)"/g) || []).length;
        if (quotesCount % 2 !== 0) {
            clean += '"';
        }

        // 🌟 2. 去除暴露在末尾的悬空逗号
        clean = clean.replace(/,\s*$/, '');

        // 🌟 3. 自动补齐缺失闭合中括号
        const openBrackets = (clean.match(/\[/g) || []).length;
        const closeBrackets = (clean.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
            clean += ']'.repeat(openBrackets - closeBrackets);
        }

        // 🌟 4. 自动补齐缺失闭合大括号
        const openBraces = (clean.match(/\{/g) || []).length;
        const closeBraces = (clean.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
            clean += '}'.repeat(openBraces - closeBraces);
        }

        return clean;
    }

    /**
     * 解析模型输出 JSON，具有强容错性并自动保底关键审计字段
     */
    function parseModelJson<T = any>(rawText: string): T {
        let clean = cleanJsonOutput(rawText);
        let parsed: any;

        try {
            parsed = JSON.parse(clean);
        } catch (e) {
            // 二次容错：去除尾部多余逗号
            try {
                clean = clean.replace(/,\s*([\}\]])/g, '$1');
                parsed = JSON.parse(clean);
            } catch (err2) {
                console.warn(`⚠️ [useAgentLlm:${roleTag}] JSON解析语法错误:`, err2.message);
                throw err2;
            }
        }

        // 🌟 核心防崩卫语句：无论大模型是否输出 anomalyList，保证其必然为数组，杜绝 "Cannot read properties of undefined (reading 'some')"
        if (parsed && typeof parsed === 'object') {
            if (!Array.isArray(parsed.anomalyList)) {
                parsed.anomalyList = [];
            }
            if (!Array.isArray(parsed.suggestions)) {
                parsed.suggestions = parsed.suggestions ? [String(parsed.suggestions)] : [];
            }
            if (typeof parsed.complianceScore !== 'number') {
                parsed.complianceScore = Number(parsed.complianceScore) || (parsed.pass ? 95 : 60);
            }
            if (typeof parsed.pass !== 'boolean') {
                parsed.pass = parsed.complianceScore >= 80;
            }
            if (!parsed.summary) {
                parsed.summary = 'AI智能审查完成';
            }
        }

        return parsed as T;
    }

    return {
        callModelApi,
        callZhipuDirect,
        callOllamaDirect,
        parseModelJson,
        cleanJsonOutput,
        getOllamaBaseUrl,
    };
}
