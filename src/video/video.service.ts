import { Body, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { VideoEntity } from './video.entity';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface ProcessVideoOptions {
    name?: string;
    fps?: number;
}
@Injectable()
export class VideoService {
    constructor(
        @InjectRepository(VideoEntity)
        private VideoEntity: Repository<VideoEntity>,
    ) {}

    async getVideoList() {
        return await this.VideoEntity.find();
    }
    async processVideo(obj: any, file: Express.Multer.File): Promise<VideoEntity> {
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

        // ============ 使用 ffprobe 获取视频元信息 ============
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
        const fps = obj?.fps || 1; // 前端传了用传的，没传默认 1
        await new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const ffmpeg = spawn('ffmpeg', ['-i', videoPath, '-vf', `fps=${fps}`, path.join(videoDir, 'frames', 'frame-%03d.png')]);
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
            name: obj || path.parse(file.originalname).name,
            filepath: `${relativeDir}/${file.originalname}${ext}`, //  相对路径
            frames: frameFiles,
            uploadId,
            fps, // 存入数据库
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
        console.log(video);
        // 1. 从文件系统删除整个目录
        const videoDir = path.dirname(video.filepath); // 如 uploads/abc123/
        console.log(videoDir);
        if (fs.existsSync(videoDir)) {
            fs.rmSync(videoDir, { recursive: true, force: true });
        }
        // 2. 从数据库删除记录
        await this.VideoEntity.remove(video);
        return;
    }
}
