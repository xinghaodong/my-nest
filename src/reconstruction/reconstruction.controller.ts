import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    UploadedFile,
    UseInterceptors,
    BadRequestException,
    Sse,
    MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReconstructionService } from './reconstruction.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('reconstruction')
export class ReconstructionController {
    constructor(private readonly reconstructionService: ReconstructionService) {}

    /**
     * SSE 实时推送通道：实时向客户端广播建模进度、状态变更与完成通知
     * 客户端连接地址: /api/reconstruction/stream
     */
    @Public()
    @Sse('stream')
    streamEvents(): Observable<MessageEvent> {
        return this.reconstructionService.getTaskEventStream();
    }

    /**
     * 上传无人机航拍相片 ZIP 压缩包并创建三维重建任务
     */
    @Public()
    @Post('upload-zip')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: 1024 * 1024 * 1024 * 2 }, // 最大支持 2GB 压缩包
        }),
    )
    async uploadZip(
        @UploadedFile() file: Express.Multer.File,
        @Body() createTaskDto: CreateTaskDto,
    ) {
        if (!file) {
            throw new BadRequestException('请上传包含无人机航拍图片的 ZIP 压缩包 (字段名: file)');
        }
        return this.reconstructionService.createTaskFromZip(file, createTaskDto);
    }

    /**
     * 分页查询建模任务列表
     */
    @Public()
    @Get('list')
    async findAll(@Query() query: QueryTaskDto) {
        return this.reconstructionService.findAll(query);
    }

    /**
     * 获取指定任务详情与进度
     */
    @Public()
    @Get('detail/:id')
    async findOne(@Param('id') id: string) {
        return this.reconstructionService.findOne(id);
    }

    /**
     * 获取任务的实时计算日志
     */
    @Public()
    @Get('logs/:id')
    async getLogs(@Param('id') id: string, @Query('lines') lines?: number) {
        return this.reconstructionService.getTaskLogs(id, lines ? Number(lines) : 50);
    }

    /**
     * 手动取消进行中的任务
     */
    @Public()
    @Post('cancel/:id')
    async cancel(@Param('id') id: string) {
        return this.reconstructionService.cancelTask(id);
    }

    /**
     * 删除任务与清理磁盘临时文件
     */
    @Public()
    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.reconstructionService.removeTask(id);
    }
}
