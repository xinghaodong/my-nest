/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit } from '@nestjs/common';
// 仅导入类型，用于代码提示，不会导致运行时 require 错误
import type { Pipeline } from '@xenova/transformers';
import fs from 'fs';
import { decode } from 'wav-decoder';
import { WaveFile } from 'wavefile';
import { ai_testservice } from './ai-com.service';

// 设置 CPU 后端 (放在最外层确保尽早执行)
process.env.TFJS_BACKEND = 'cpu';

@Injectable()
export class AiComSttService implements OnModuleInit {
    // 保存 pipeline 实例
    private pipelineInstance: any = null;
    constructor(private aiTestservice: ai_testservice) {}

    // 使用 OnModuleInit 替代 constructor，确保 NestJS 初始化流程更规范
    async onModuleInit() {
        // console.log('AiComSttService 初始化中...');
        // await this.loadModel();
    }

    async loadModel() {
        console.log('模型加载中...');
        try {
            // 步骤 1: 动态导入库 (解决 ERR_REQUIRE_ESM 问题)
            // 这里的参数必须是包名 '@xenova/transformers'
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            const { pipeline } = await dynamicImport('@xenova/transformers');

            // 步骤 2: 使用导入的 pipeline 函数初始化具体模型
            // 这里才是传入 'automatic-speech-recognition' 和模型名称的地方
            // automatic-speech-recognition', 'Xenova/whisper-tiny.en
            this.pipelineInstance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');

            console.log('模型加载完成！');
        } catch (error) {
            console.error('模型加载失败:', error);
        }
    }

    async loadWavToFloat32(filePath: string): Promise<Float32Array> {
        // 1. 读取文件
        const buffer = fs.readFileSync(filePath);
        const wav = new WaveFile(buffer);

        // 2. 转换为 32-bit float（单精度浮点）
        wav.toBitDepth('32f');

        // 3. 重采样到 16000 Hz（Whisper 要求）
        wav.toSampleRate(16000);

        // 4. 获取音频数据
        let audioData = wav.getSamples();

        // 5. 处理多通道 → 单通道
        if (Array.isArray(audioData)) {
            if (audioData.length > 1) {
                // 立体声：合并为单声道（官方做法）
                const SCALING_FACTOR = Math.sqrt(2);
                for (let i = 0; i < audioData[0].length; i++) {
                    audioData[0][i] = (SCALING_FACTOR * (audioData[0][i] + audioData[1][i])) / 2;
                }
            }
            audioData = audioData[0]; // 取第一个通道
        }

        return audioData as unknown as Float32Array;
    }

    async transcribe(filePath: string) {
        if (!this.pipelineInstance) {
            console.log('模型未就绪，正在尝试初始化...');
            await this.loadModel();
            if (!this.pipelineInstance) {
                throw new Error('STT模型尚未加载');
            }
        }

        console.log('开始识别文件：', filePath);
        const float32 = await this.loadWavToFloat32(filePath);
        console.log('音频长度（采样点）：', float32.length);

        const result = await this.pipelineInstance(float32, {
            chunk_length_s: 15,
            stride_length_s: 5,
        });

        console.log('识别结果：', result);
        // 测试自己调自己 调用 callOllamaStream服务
        // prompt: string, conversationId: string, model: string, useInternetSearch: string, res: any
        // this.aiTestservice.callOllamaStream(result?.text, '156', 'gemma3:4b', '0', null);

        // 直接调用你自己的 /stream 接口（和前端一模一样）
        // const response = await fetch(
        //     'http://localhost:3000/api/ai/stream?' +
        //         new URLSearchParams({
        //             prompt: result?.text,
        //             conversationId: '156',
        //             model: 'gemma3:4b',
        //             enableInternetSearch: '0',
        //         }),
        // );

        // // 实时打印服务端返回的 SSE 数据（用于调试）
        // if (!response.body) return result?.text;

        // const reader = response.body.getReader();
        // const decoder = new TextDecoder();

        // while (true) {
        //     const { done, value } = await reader.read();
        //     if (done) {
        //         console.log('流式响应结束');
        //         break;
        //     }
        //     const chunk = decoder.decode(value);
        //     console.log('服务端返回：', chunk);
        //     process.stdout.write(chunk); // 在控制台直接看到实时文字和 audio 事件
        //     // 如果你还想解析 JSON 做进一步处理，也可以：
        //     // chunk.split('\n\n').forEach(line => { ... })
        // }

        return result?.text || '';
    }
}
