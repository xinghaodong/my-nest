import { Body, Controller, Get, ParseIntPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { VideoService } from './video.service';
import { VideoEntity } from './video.entity';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('video')
export class VideoController {
    constructor(private readonly service: VideoService) {}

    /**
     * 查询所有视频列表
     * @returns 视频列表
     */
    @Get('findAll')
    async getVideoList(): Promise<VideoEntity[]> {
        return await this.service.getVideoList();
    }
    /**
     * 创建视频
     * @returns 创建的视频
     */
    @Post('create')
    @UseInterceptors(FileInterceptor('file'))
    async createVideo(@Body('name') name: string, @UploadedFile() file: Express.Multer.File): Promise<VideoEntity> {
        return await this.service.processVideo(name, file);
    }

    /**
     * 删除视频
     * @param id 视频id
     */
    @Post('delete')
    async deleteVideo(@Body('id', new ParseIntPipe()) id: number): Promise<void> {
        await this.service.deleteVideo(id);
    }
}
