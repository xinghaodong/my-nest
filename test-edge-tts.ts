/* eslint-disable prettier/prettier */
// test-edge-tts.ts   （放在项目根目录，和 src 同级）
// 文件名：test-edge-tts.ts   （放在项目根目录或任意位置）

import { EdgeTTS } from '@travisvn/edge-tts';
import * as fs from 'fs/promises';
import * as path from 'path';

async function test() {
    const text = '你好，我是晓伊，很高兴认识你！今天天气真不错，我们一起出去玩吧～';
    const voice = 'zh-CN-XiaoyiNeural';

    console.log('正在请求微软云端神经语音合成...');
    console.log(`文本：${text}`);
    console.log(`声音：${voice}\n`);

    try {
        // 新建 EdgeTTS 实例（支持 rate/volume/pitch）
        const tts = new EdgeTTS(text, voice, {
            rate: '+10%', // 语速稍快
            volume: '+0%', // 音量正常
            pitch: '+5Hz', // 音调稍高
        });

        // 调用 synthesize() 获取结果
        const result = await tts.synthesize();

        // 处理音频 Buffer（result.audio 是 ReadableStream）
        const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

        const outputPath = path.join(process.cwd(), 'test-output.mp3');
        await fs.writeFile(outputPath, audioBuffer);

        console.log('成功！网络正常，TTS 可用。');
        console.log(`文件已保存：${outputPath}`);
        console.log(`文件大小：${(audioBuffer.length / 1024).toFixed(2)} KB`);
        console.log('现在去双击 test-output.mp3 听听看吧！如果能听到晓伊的声音，证明一切 OK。');
    } catch (error: any) {
        console.error('合成失败！');
        console.error('错误信息：', error.message || error);

        if (error.message?.includes('timeout') || error.message?.includes('fetch') || error.message?.includes('ENOTFOUND')) {
            console.error('\n网络问题（被墙或代理失效），请尝试：');
            console.error('1. 给服务器配全局代理（如 Clash/V2Ray，端口 7890）');
            console.error('2. 打开上面第 6 行的代理设置');
            console.error('3. 测试命令：curl https://www.bing.com （如果超时，就是墙）');
        } else if (error.message?.includes('voice')) {
            console.error('声音名无效，试试 zh-CN-YunxiNeural（男声）');
        } else {
            console.error('可能是包 API 问题，检查 npm 包版本：npm ls @travisvn/edge-tts');
        }
    }
}

test();
