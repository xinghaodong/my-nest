/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { EdgeTTS } from '@travisvn/edge-tts';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AiController } from './ai-com.controller';

@Injectable()
export class AiTtsStreamService {
    private activeTtsControllers = new Map<string, AbortController>();
    cleanTtsText(text: string) {
        if (!text) return '';

        let cleaned = text
            .replace(/[※#@￥%&*^~`]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[。！？.!?]{2,}/g, '$&'.slice(0, 1))
            .replace(/[\(\（].*?[\)\）]/g, '')
            .replace(/…/g, '')
            .replace(/\.{3,}/g, '，')
            .trim();

        // 关键修复：每句前面加一个看不见的“。”（中文全角句号）或空格
        // 微软会把这个“.”当成前置引导音，吃掉它，而不是你的正文
        // 人类完全听不出来，但完美防截断！
        cleaned = '  ' + cleaned;

        // 可选：如果你特别在意，还可以加多个
        // cleaned = '。。' + cleaned;

        return cleaned;
    }
    /**
     * 文字转语音（TTS） 生成.mp3文件
     */
    // async tts(text: string): Promise<string> {
    //     const voice = 'zh-CN-YunxiNeural';
    //     // zh-CN-XiaoyiNeural      // 女声，最受欢迎，温柔活泼
    //     // zh-CN-YunxiNeural       // 男声，最受欢迎，年轻磁性
    //     // zh-CN-YunyangNeural     // 男声，成熟稳重（客服常用）
    //     // zh-CN-XiaochenNeural    // 女声，清脆专业
    //     // zh-CN-XiaohanNeural     // 女声，可爱元气
    //     // zh-CN-XiaomoNeural      // 女声，情感丰富（带点嗔怪）
    //     // zh-CN-XiaoxiaoNeural    // 女声，标准播音腔
    //     // zh-CN-XiaoyanNeural     // 女声，老版经典（非神经）
    //     // zh-CN-liaoning-XiaobeiNeural  // 东北口音女声
    //     // zh-CN-shandong-YunxiangNeural // 山东口音男声

    //     console.log('开始 TTS 合成：', text);
    //     const cleanText = this.cleanTtsText(text);

    //     if (!cleanText) return '';
    //     const tts = new EdgeTTS(cleanText, voice, {
    //         rate: '+10%',
    //         volume: '+0%',
    //         pitch: '+5Hz',
    //     });

    //     const result = await tts.synthesize();
    //     const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

    //     // 文件名
    //     const fileName = `tts_${Date.now()}.mp3`;
    //     const outputPath = path.join(process.cwd(), 'uploads', fileName);

    //     await fs.writeFile(outputPath, audioBuffer);

    //     console.log('TTS 生成成功：', outputPath);

    //     // 返回给前端播放用
    //     return `uploads/${fileName}`;
    // }

    /**
     * 关键改造：直接返回 base64，不写磁盘！
     */
    async tts(text: string): Promise<string | null> {
        const voice = 'zh-CN-YunxiNeural'; // 你可以改成 XiaoyiNeural 等

        console.log('开始 TTS 内存合成：', text);

        const cleanText = this.cleanTtsText(text);
        if (!cleanText) return null;

        try {
            const tts = new EdgeTTS(cleanText, voice, {
                rate: '+5%', //语速
                volume: '+0%', //音量
                pitch: '+5Hz', //音调（基频）
            });

            const result = await tts.synthesize();
            const audioBlob = result.audio; // 这是 Blob（二进制数据）

            // 修复：用 arrayBuffer() 获取整个音频数据（官方推荐）
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);

            const base64 = audioBuffer.toString('base64');

            console.log('TTS 内存合成成功，base64 长度:', base64.length);

            // 直接返回 base64，前端用 data:audio/mp3;base64, 播放
            return base64;
        } catch (err: any) {
            console.error('TTS 合成失败:', err.message);
            return null;
        }
    }

    /**
     * 停止当前语音生成
     */
    stopTts(conversationId: string) {
        const controller = this.activeTtsControllers.get(conversationId);
        if (controller) {
            controller.abort();
            this.activeTtsControllers.delete(conversationId);
        }
    }
}
