/**
 * node fs 模块 方法说明
 * 1 const uploadDir = path.join(__dirname, '..', '..', 'uploads');
 *  作用：把多个路径片段拼成一个完整路径
 *   跨平台：Windows → \，Linux/Mac → /
 *  2 fs.existsSync(path)：判断文件或目录是否存在
 *
 *  3 fs.mkdirSync(videoDir); 同步创建目录 fs.mkdirSync(videoDir, { recursive: true }); // 自动创建父目录
 *
 *  4 fs.rmSync(dir, options)：删除目录
 *    fs.rmSync(videoDir, { recursive: true, force: true });
 *    recursive: true：递归删除子目录
 *    force: true：即使目录不存在也不报错（类似 rm -f）
 *
 *   5 fs.writeFileSync(file, data)：写入文件
 *     fs.writeFileSync(videoPath, file.buffer);
 *     把 Buffer 写入磁盘
 *     适用于小文件（< 100MB）
 *     大文件建议用 fs.createWriteStream 流式写入，避免内存溢出
 *
 *   6 fs.readdirSync(dir)：读取目录下所有文件
 *     fs.readdirSync(framesDir).filter(f => f.endsWith('.png')) // 返回文件名数组：['frame-001.png', 'frame-002.png']
 *
 *   7  path.join() 方法：拼接路径
 *
 */

import { Body, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { VideoEntity } from './video.entity';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { videoDto } from './video.dto';

@Injectable()
export class VideoService {
    constructor(
        @InjectRepository(VideoEntity)
        private VideoEntity: Repository<VideoEntity>,
    ) {}

    async getVideoList() {
        return await this.VideoEntity.find();
    }
    async processVideo(videoDto: videoDto, file: Express.Multer.File): Promise<VideoEntity> {
        // console.log(videoDto, 'videoDto1');
        const { name, fps } = videoDto;
        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

        const uploadId = uuidv4();
        const ext = path.extname(file.originalname);
        const videoDir = path.join(uploadDir, uploadId);
        const relativeDir = `uploads/${uploadId}`; // 相对路径前缀

        fs.mkdirSync(videoDir);
        fs.mkdirSync(path.join(videoDir, 'frames'));

        // 保存视频
        const videoPath = path.join(videoDir, file.originalname + ext);
        fs.writeFileSync(videoPath, file.buffer);

        // 使用 ffprobe 获取视频元信息
        let duration = 0;
        let metadata: any = null;

        try {
            const { spawnSync } = require('child_process');
            const ffprobe = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath]);
            if (ffprobe.status === 0) {
                const output = JSON.parse(ffprobe.stdout.toString());
                duration = parseFloat(output.format.duration) || 0;
                metadata = {
                    format: output.format.format_name,
                    bitrate: output.format.bit_rate,
                    size: output.format.size,
                };
            }
        } catch (error) {
            console.warn('ffprobe返回数据失败', error);
            duration = 0;
            metadata = null;
        }

        // 拆帧 fps=1 代表1秒1帧 支持动态 fps
        const fpsparam = fps || 1; // 前端传了用传的，没传默认 1
        await new Promise((resolve, reject) => {
            // const { spawn } = require('child_process');
            const ffmpeg = spawn('ffmpeg', ['-i', videoPath, '-vf', `fps=${fpsparam}`, path.join(videoDir, 'frames', 'frame-%03d.png')]);
            ffmpeg.on('close', code => {
                if (code === 0) {
                    resolve(true);
                } else {
                    reject(new Error('FFmpeg生成失败'));
                }
            });
        });

        // 只存相对路径
        const frameFiles = fs
            .readdirSync(path.join(videoDir, 'frames'))
            .filter(f => f.endsWith('.png'))
            .map(f => `${relativeDir}/frames/${f}`); // uploads/abc123/frames/frame-001.png
        const video = this.VideoEntity.create({
            name: name || path.parse(file.originalname).name,
            filepath: `${relativeDir}/${file.originalname}${ext}`, //  相对路径
            frames: frameFiles,
            uploadId,
            fps: fpsparam, // 存入数据库
            duration, // 存时长
            metadata, // 存完整元数据
        });
        return await this.VideoEntity.save(video);
    }

    /**
     * 删除视频
     */
    async deleteVideo(id: number): Promise<void> {
        const video = await this.VideoEntity.findOne({ where: { id } });
        if (!video) throw new Error('未找到视频');
        // 1. 从文件系统删除整个目录
        const videoDir = path.dirname(video.filepath); // 如 uploads/abc123/
        if (fs.existsSync(videoDir)) {
            fs.rmSync(videoDir, { recursive: true, force: true });
        }
        // 2. 从数据库删除记录
        await this.VideoEntity.remove(video);
        return;
    }

    /**
     * 修改视频
     * @param id
     * @param name
     * @param fps
     * @param file
     * @returns
     */
    async updateVideo(
        id: number,
        name: string,
        fps: number | undefined,
        file: Express.Multer.File | null, // 允许为 null
    ): Promise<VideoEntity> {
        const video = await this.VideoEntity.findOne({ where: { id } });
        if (!video) throw new Error('未找到视频');
        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        const videoDir = path.join(uploadDir, video.uploadId);
        const relativeDir = `uploads/${video.uploadId}`;
        const framesDir = path.join(videoDir, 'frames');

        let shouldReprocess = false; // 是否需要重新拆帧
        let videoPath = path.join(videoDir, path.basename(video.filepath)); // 当前视频路径

        //1. 判断是否需要重新处理 改了 fps 或换了文件
        const originalFps = video.fps;
        const newFps = fps ? fps : originalFps;
        let fpsChanged = false;
        const fileChanged = !!file; // 如果 file 存在且不是假值，则 fileChanged 为 true；否则为 false
        if (fps != video.fps) {
            fpsChanged = true;
        }

        if (fpsChanged || fileChanged) {
            console.log('fpsChanged', fpsChanged, newFps);
            shouldReprocess = true;
        }
        // === 2. 如果换了文件：删除旧目录，写入新文件 ===
        if (fileChanged) {
            // 删除旧的整个目录（包括视频 + 帧）
            if (fs.existsSync(videoDir)) {
                fs.rmSync(videoDir, { recursive: true, force: true });
            }

            // 创建新目录
            fs.mkdirSync(videoDir);
            fs.mkdirSync(framesDir);

            // 写入新视频
            const ext = path.extname(file.originalname);
            const newFilename = file.originalname + ext;
            videoPath = path.join(videoDir, newFilename);

            fs.writeFileSync(videoPath, file.buffer);

            // 更新数据库字段
            video.filepath = `${relativeDir}/${newFilename}`;
        } else {
            // 没换文件：确保原视频路径存在
            if (!fs.existsSync(videoPath)) {
                throw new Error('原视频文件丢失，无法重新处理');
            }
        }

        //  3. 如果需要重新处理 fps 改了 或 文件换了
        if (shouldReprocess) {
            // 清空旧帧 即使只是改 fps
            if (fs.existsSync(framesDir)) {
                fs.rmSync(framesDir, { recursive: true, force: true });
            }
            fs.mkdirSync(framesDir); // 重建

            // 重新获取元信息
            let duration = 0;
            let metadata: any = null;
            try {
                const { spawnSync } = require('child_process');
                const ffprobe = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath]);

                if (ffprobe.status === 0) {
                    const output = JSON.parse(ffprobe.stdout.toString());
                    duration = parseFloat(output.format.duration) || 0;
                    metadata = {
                        format: output.format.format_name,
                        bitrate: output.format.bit_rate,
                        size: output.format.size,
                    };
                }
            } catch (err) {
                console.warn('ffprobe 失败', err);
                duration = 0;
                metadata = null;
            }

            // === 重新拆帧（ffmpeg）===
            await new Promise((resolve, reject) => {
                // const { spawn } = require('child_process');
                const ffmpeg = spawn('ffmpeg', ['-i', videoPath, '-vf', `fps=${newFps}`, path.join(framesDir, 'frame-%03d.png')]);

                ffmpeg.on('close', code => {
                    if (code === 0) {
                        resolve(true);
                    } else {
                        reject(new Error('FFmpeg 拆帧失败'));
                    }
                });

                // 监听日志
                ffmpeg.stderr.on('data', data => {
                    console.log(`[FFmpeg] ${data.toString()}`);
                });
            });

            //  生成新帧路径列表
            const frameFiles = fs
                .readdirSync(framesDir)
                .filter(f => f.endsWith('.png'))
                .map(f => `${relativeDir}/frames/${f}`);

            // 更新需要变动的字段
            video.frames = frameFiles;
            video.fps = newFps;
            video.duration = duration;
            video.metadata = metadata;
        }

        // 4. 更新名称
        if (name) {
            video.name = name;
        }
        //  5. 保存到数据库
        return await this.VideoEntity.save(video);
    }

    /**
     * 获取视频详情
     * @param id 视频id
     * @return 视频相关信息
     */
    async detail(id: number): Promise<VideoEntity> {
        const video = await this.VideoEntity.findOne({ where: { id } });
        if (!video) throw new Error('未找到视频');
        return video;
    }
}
