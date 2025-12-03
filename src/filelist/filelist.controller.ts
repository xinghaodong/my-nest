import { BadRequestException, Body, Controller, Get, InternalServerErrorException, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileList } from './entities/filelist.entity';
import { FilelistService } from './filelist.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('upload')
export class FilelistController {
    constructor(private readonly filesService: FilelistService) {}

    // 不需要传递 Token
    @Public()
    @Post('uploadFile')
    @UseInterceptors(FileInterceptor('avatar')) // 直接使用注册好的 Multer 配置
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        try {
            if (!file) {
                throw new BadRequestException('未上传文件');
            }
            const fileEntity = new FileList();
            fileEntity.fileName = file.filename;
            fileEntity.contentType = file.mimetype;
            fileEntity.fileSize = file.size;
            fileEntity.filePath = file.path.replace(/\\/g, '/');
            return this.filesService.saveFile(fileEntity);
        } catch (error) {
            // 处理异常
            console.error('文件处理过程中发生错误:', error);
            // 可以根据需要进行更详细的错误处理或抛出特定异常
        }
        // 存储文件信息到数据库
    }
    // 预览文件
    @Get('previewFile')
    async previewFile(@Query('files') files: string) {
        return this.filesService.previewFiles(files);
    }
    // 根据id获取文件
    @Public()
    @Get('getFileById')
    async getFileById(@Query('id') id: number) {
        return this.filesService.findById(id);
    }
}
