import { Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileList } from './entities/filelist.entity';
import { FilelistService } from './filelist.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('upload')
export class FilelistController {
    constructor(private readonly filesService: FilelistService) {}

    @Post('uploadFile')
    @UseInterceptors(FileInterceptor('avatar')) // 直接使用注册好的 Multer 配置
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        const fileEntity = new FileList();
        fileEntity.fileName = file.filename;
        fileEntity.contentType = file.mimetype;
        fileEntity.fileSize = file.size;
        fileEntity.filePath = file.path.replace(/\\/g, '/');
        // 存储文件信息到数据库
        return this.filesService.saveFile(fileEntity);
    }
    // 预览文件
    @Get('previewFile')
    async previewFile(@Query('files') files: string) {
        return this.filesService.previewFiles(files);
    }
}
