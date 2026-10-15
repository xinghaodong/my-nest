import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ReconstructionTask, ReconstructionStatus } from './entities/reconstruction-task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { Subject, Observable, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip = require('adm-zip');

@Injectable()
export class ReconstructionService implements OnModuleInit {
    private readonly logger = new Logger(ReconstructionService.name);
    private odmUrl: string;
    private odmDataDir: string;
    private activePollers = new Map<string, NodeJS.Timeout>();
    // SSE 实时事件广播流
    private readonly taskEvents$ = new Subject<{ type: string; data: any }>();

    constructor(
        @InjectRepository(ReconstructionTask)
        private readonly taskRepo: Repository<ReconstructionTask>,
        private readonly configService: ConfigService,
    ) {
        this.odmUrl = this.configService.get<string>('ODM_URL', 'http://127.0.0.1:3050');
        const configuredDir = this.configService.get<string>('ODM_DATA_DIR', 'uploads/odm_cache');
        this.odmDataDir = path.isAbsolute(configuredDir)
            ? configuredDir
            : path.resolve(process.cwd(), configuredDir);
        if (!fs.existsSync(this.odmDataDir)) {
            fs.mkdirSync(this.odmDataDir, { recursive: true });
        }
    }

    /**
     * 向所有已连接的 SSE 客户端广播实时事件
     */
    notifyTaskEvent(type: 'task_created' | 'task_updated' | 'task_completed' | 'task_failed' | 'task_deleted', data: any) {
        try {
            this.taskEvents$.next({ type, data });
        } catch (err) {
            this.logger.warn(`广播 SSE 事件异常: ${err.message}`);
        }
    }

    /**
     * 获取 SSE 实时事件流 (内置 25 秒 ping 心跳，防止反向代理超时断开)
     */
    getTaskEventStream(): Observable<MessageEvent> {
        const heartbeat$ = interval(25000).pipe(
            map(() => ({
                data: { type: 'ping', timestamp: Date.now() },
            } as MessageEvent)),
        );

        const events$ = this.taskEvents$.asObservable().pipe(
            map((event) => ({
                data: event,
            } as MessageEvent)),
        );

        return merge(events$, heartbeat$);
    }

    async onModuleInit() {
        this.logger.log(`🔗 NodeODM 引擎地址: ${this.odmUrl}`);
        this.logger.log(`📁 3D Tiles 产出存储根目录: ${this.odmDataDir}`);
        this.logger.log('📡 SSE 实时推送通道已就绪 (/api/reconstruction/stream)');
        // 服务重启后，自动尝试恢复之前未完成任务的轮询监听
        this.resumeUnfinishedTasks();
    }

    /**
     * 接收上传的 ZIP 压缩包，创建并立即启动异步三维重建流水线
     */
    async createTaskFromZip(file: Express.Multer.File, dto: CreateTaskDto): Promise<ReconstructionTask> {
        if (!file) {
            throw new BadRequestException('请上传包含无人机航拍相片的 ZIP 压缩包');
        }

        const taskName = dto.name || path.parse(file.originalname).name || `航拍三维建模_${Date.now()}`;

        // 1. 在数据库中创建任务初始记录
        const task = this.taskRepo.create({
            name: taskName,
            flightId: dto.flightId,
            engineMode: dto.engineMode || 'auto',
            status: ReconstructionStatus.PENDING,
            progress: 0,
            stage: '等待解压相片',
            options: {
                quality: dto.quality || 'low',
                withDem: dto.withDem || false,
            },
        });
        const savedTask = await this.taskRepo.save(task);

        // 2. 准备该任务的专属磁盘工作目录
        const taskDir = path.resolve(process.cwd(), 'uploads/reconstruction', savedTask.id);
        const imagesDir = path.join(taskDir, 'images');
        fs.mkdirSync(imagesDir, { recursive: true });

        // 将上传的 zip 文件移动到任务目录
        const zipPath = path.join(taskDir, 'package.zip');
        fs.writeFileSync(zipPath, file.buffer || fs.readFileSync(file.path));

        savedTask.zipPath = zipPath;
        savedTask.imagesDir = imagesDir;
        await this.taskRepo.save(savedTask);

        // 广播新任务创建事件
        this.notifyTaskEvent('task_created', savedTask);

        // 3. 异步启动重建流水线（立即返回任务基础信息给前端，不阻塞 HTTP 响应）
        this.executeReconstructionPipeline(savedTask.id).catch((err) => {
            this.logger.error(`❌ 任务 [${savedTask.id}] 流水线执行抛出异常: ${err.message}`, err.stack);
        });

        return savedTask;
    }

    /**
     * 核心三维重建流水线（支持 CPU / GPU 全自动兼容）
     */
    private async executeReconstructionPipeline(taskId: string) {
        const task = await this.taskRepo.findOne({ where: { id: taskId } });
        if (!task) return;

        try {
            // [步骤 1]: 解压照片压缩包
            await this.updateTaskStatus(taskId, ReconstructionStatus.EXTRACTING, 5, '正在解压照片压缩包...');
            const zip = new AdmZip(task.zipPath);
            zip.extractAllTo(task.imagesDir, true);

            // 递归搜索解压目录中的所有 jpg/jpeg 照片（兼容用户压缩了整层文件夹的情况）
            const imagePaths = this.findImagesRecursively(task.imagesDir);
            if (imagePaths.length === 0) {
                throw new Error('ZIP 压缩包中未检测到有效的 JPG/JPEG 格式无人机航拍相片！');
            }

            task.photoCount = imagePaths.length;
            await this.taskRepo.save(task);
            this.logger.log(`✔ [${taskId}] 成功提取 ${imagePaths.length} 张相片`);

            // [步骤 2]: 组装 CPU / GPU 通用的建模参数
            const quality = task.options?.quality || 'low';
            const options: Array<{ name: string; value: any }> = [
                { name: '3d-tiles', value: true },          // 输出 Cesium 3D Tiles
                { name: 'use-exif', value: true },          // 提取照片 GPS / POS 信息
                { name: 'feature-quality', value: quality }, // 特征点抽取精度 (默认 low)
                { name: 'pc-quality', value: 'lowest' },    // 密集点云降噪防 OOM
                { name: 'mesh-octree-depth', value: 8 },    // 网格细分层级
                { name: 'skip-orthophoto', value: true },   // 跳过二维正射，纯出三维
            ];

            if (task.options?.withDem) {
                options.push({ name: 'dsm', value: true }, { name: 'dtm', value: true });
            }

            // [步骤 3]: 初始化 NodeODM 任务 (/task/new/init)
            await this.updateTaskStatus(taskId, ReconstructionStatus.UPLOADING, 10, '正在向 NodeODM 引擎注册任务...');
            const initForm = new FormData();
            initForm.append('name', task.name);
            initForm.append('options', JSON.stringify(options));

            const initRes = await fetch(`${this.odmUrl}/task/new/init`, {
                method: 'POST',
                body: initForm,
            });
            if (!initRes.ok) {
                throw new Error(`NodeODM 任务初始化失败: ${initRes.status} ${initRes.statusText}`);
            }
            const { uuid: odmUuid } = await initRes.json();
            task.odmUuid = odmUuid;
            await this.taskRepo.save(task);
            this.logger.log(`✔ [${taskId}] 引擎任务注册成功，ODM UUID: ${odmUuid}`);

            // [步骤 4]: 上传图片到 NodeODM (/task/new/upload/{uuid})
            await this.updateTaskStatus(taskId, ReconstructionStatus.UPLOADING, 15, `正在上传 ${imagePaths.length} 张图片到引擎...`);
            const uploadForm = new FormData();
            for (const imgPath of imagePaths) {
                const buffer = fs.readFileSync(imgPath);
                const filename = path.basename(imgPath);
                uploadForm.append('images', new Blob([buffer]), filename);
            }

            const uploadRes = await fetch(`${this.odmUrl}/task/new/upload/${odmUuid}`, {
                method: 'POST',
                body: uploadForm,
            });
            const uploadJson: any = await uploadRes.json().catch(() => ({}));
            if (!uploadRes.ok || uploadJson.error) {
                throw new Error(`图片上传到引擎失败: ${uploadJson.error || uploadRes.statusText}`);
            }
            this.logger.log(`✔ [${taskId}] 图片批量上传完毕`);

            // [步骤 5]: 正式提交并启动建模计算 (/task/new/commit/{uuid})
            await this.updateTaskStatus(taskId, ReconstructionStatus.PROCESSING, 20, '正在启动三维重建引擎...');
            const commitRes = await fetch(`${this.odmUrl}/task/new/commit/${odmUuid}`, {
                method: 'POST',
            });
            const commitJson: any = await commitRes.json().catch(() => ({}));
            if (!commitRes.ok || commitJson.error) {
                throw new Error(`启动建模失败: ${commitJson.error || commitRes.statusText}`);
            }
            this.logger.log(`✔ [${taskId}] NodeODM 建模已正式启动，开始轮询进度...`);

            // [步骤 6]: 启动轮询监听进度
            this.startPolling(taskId, odmUuid);
        } catch (err) {
            this.logger.error(`❌ [${taskId}] 流水线执行失败: ${err.message}`);
            await this.taskRepo.update(taskId, {
                status: ReconstructionStatus.FAILED,
                errorMessage: err.message,
                stage: '建模中断失败',
            });
            this.notifyTaskEvent('task_failed', {
                id: taskId,
                status: ReconstructionStatus.FAILED,
                errorMessage: err.message,
                stage: '建模中断失败',
            });
        }
    }

    /**
     * 轮询 NodeODM 进度与状态
     */
    private startPolling(taskId: string, odmUuid: string) {
        if (this.activePollers.has(taskId)) {
            clearInterval(this.activePollers.get(taskId)!);
        }

        const interval = setInterval(async () => {
            try {
                const infoRes = await fetch(`${this.odmUrl}/task/${odmUuid}/info`);
                if (!infoRes.ok) {
                    this.logger.warn(`获取任务 [${odmUuid}] 状态失败: ${infoRes.status}`);
                    return;
                }
                const info = await infoRes.json();
                const code = info.status?.code;
                const progress = info.progress || 0;

                // 映射大致阶段文字
                let stageText = '三维重建计算中';
                if (progress < 25) stageText = '特征点提取与匹配';
                else if (progress < 55) stageText = '稀疏点云 SfM 重建';
                else if (progress < 75) stageText = '稠密点云与三角网剖分';
                else if (progress < 95) stageText = '纹理映射与 3D Tiles 分片转换';

                // code: 10=QUEUED, 20=RUNNING, 30=FAILED, 40=COMPLETED, 50=CANCELED
                if (code === 40) {
                    clearInterval(interval);
                    this.activePollers.delete(taskId);

                    const processingTimeSec = info.processingTime ? Math.round(info.processingTime / 1000) : null;
                    const tilesetUrl = `/api/models/${odmUuid}/3d_tiles/model/tileset.json`;

                    // 清理本地临时解压的照片文件夹（保留 package.zip 原始包）
                    const taskDir = path.resolve(process.cwd(), 'uploads/reconstruction', taskId);
                    const unzippedImagesDir = path.join(taskDir, 'images');
                    if (fs.existsSync(unzippedImagesDir)) {
                        fs.rmSync(unzippedImagesDir, { recursive: true, force: true });
                        this.logger.log(`🧹 [${taskId}] 已清理本地临时解压相片目录`);
                    }

                    await this.taskRepo.update(taskId, {
                        status: ReconstructionStatus.SUCCESS,
                        progress: 100,
                        stage: '三维重建全部完成',
                        processingTime: processingTimeSec,
                        tilesetUrl: tilesetUrl,
                    });
                    this.logger.log(`🎉 [${taskId}] 三维重建成功！耗时: ${processingTimeSec} 秒，模型: ${tilesetUrl}`);

                    const completedTask = await this.taskRepo.findOne({ where: { id: taskId } });
                    this.notifyTaskEvent('task_completed', completedTask || {
                        id: taskId,
                        status: ReconstructionStatus.SUCCESS,
                        progress: 100,
                        stage: '三维重建全部完成',
                        processingTime: processingTimeSec,
                        tilesetUrl,
                    });
                    return;
                }

                if (code === 30 || code === 50) {
                    clearInterval(interval);
                    this.activePollers.delete(taskId);

                    let errorMsg = 'NodeODM 引擎内部处理失败';
                    try {
                        const logRes = await fetch(`${this.odmUrl}/task/${odmUuid}/output?line=-20`);
                        const logs = await logRes.json();
                        errorMsg = Array.isArray(logs) ? logs.join('\n') : JSON.stringify(logs);
                    } catch {}

                    const finalStatus = code === 50 ? ReconstructionStatus.CANCELED : ReconstructionStatus.FAILED;
                    const finalStage = code === 50 ? '任务已取消' : '引擎处理失败';
                    await this.taskRepo.update(taskId, {
                        status: finalStatus,
                        stage: finalStage,
                        errorMessage: errorMsg,
                    });
                    this.logger.error(`❌ [${taskId}] 建模异常结束 (code ${code}): ${errorMsg}`);

                    this.notifyTaskEvent('task_failed', {
                        id: taskId,
                        status: finalStatus,
                        stage: finalStage,
                        errorMessage: errorMsg,
                    });
                    return;
                }

                // 正常运行中，更新实时进度
                await this.taskRepo.update(taskId, {
                    status: ReconstructionStatus.PROCESSING,
                    progress: Math.min(progress, 99),
                    stage: stageText,
                });
                this.notifyTaskEvent('task_updated', {
                    id: taskId,
                    status: ReconstructionStatus.PROCESSING,
                    progress: Math.min(progress, 99),
                    stage: stageText,
                });
            } catch (pollErr) {
                this.logger.warn(`轮询出现异常: ${pollErr.message}`);
            }
        }, 3000);

        this.activePollers.set(taskId, interval);
    }

    /**
     * 递归查找目录下的所有 JPG 相片
     */
    private findImagesRecursively(dir: string): string[] {
        const results: string[] = [];
        if (!fs.existsSync(dir)) return results;

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.findImagesRecursively(fullPath));
            } else if (/\.(jpe?g)$/i.test(entry.name)) {
                results.push(fullPath);
            }
        }
        return results;
    }

    private async updateTaskStatus(taskId: string, status: ReconstructionStatus, progress: number, stage: string) {
        await this.taskRepo.update(taskId, { status, progress, stage });
        this.notifyTaskEvent('task_updated', { id: taskId, status, progress, stage });
    }

    /**
     * 服务重启恢复未完成的任务
     */
    private async resumeUnfinishedTasks() {
        try {
            const inFlightTasks = await this.taskRepo.find({
                where: [
                    { status: ReconstructionStatus.PROCESSING },
                    { status: ReconstructionStatus.UPLOADING },
                    { status: ReconstructionStatus.QUEUED },
                ],
            });
            for (const task of inFlightTasks) {
                if (task.odmUuid) {
                    this.logger.log(`🔄 恢复对任务 [${task.id}] (ODM: ${task.odmUuid}) 的状态监听`);
                    this.startPolling(task.id, task.odmUuid);
                }
            }
        } catch (err) {
            this.logger.warn(`无法恢复未完成任务: ${err.message}`);
        }
    }

    /**
     * 分页查询任务列表
     */
    async findAll(dto: QueryTaskDto) {
        const { page = 1, pageSize = 10, status, flightId } = dto;
        const query = this.taskRepo.createQueryBuilder('task');

        if (status) {
            query.andWhere('task.status = :status', { status });
        }
        if (flightId) {
            query.andWhere('task.flightId = :flightId', { flightId });
        }

        query.orderBy('task.createdAt', 'DESC');
        query.skip((page - 1) * pageSize).take(pageSize);

        const [list, total] = await query.getManyAndCount();
        return { list, total, page, pageSize };
    }

    /**
     * 查询任务详情（同时从 NodeODM 获取引擎实时状态）
     */
    async findOne(id: string) {
        const task = await this.taskRepo.findOne({ where: { id } });
        if (!task) {
            throw new NotFoundException(`任务不存在: ${id}`);
        }
        return task;
    }

    /**
     * 获取任务的实时控制台日志
     */
    async getTaskLogs(id: string, lines = 50) {
        const task = await this.findOne(id);
        if (!task.odmUuid) {
            return { logs: ['任务尚未提交到 NodeODM 引擎'] };
        }
        try {
            const logRes = await fetch(`${this.odmUrl}/task/${task.odmUuid}/output?line=-${lines}`);
            if (!logRes.ok) throw new Error(`获取日志失败: ${logRes.status}`);
            const logs = await logRes.json();
            return { logs: Array.isArray(logs) ? logs : [logs] };
        } catch (e) {
            return { logs: [`获取日志失败: ${e.message}`] };
        }
    }

    /**
     * 手动取消任务
     */
    async cancelTask(id: string) {
        const task = await this.findOne(id);
        if (task.odmUuid) {
            try {
                const cancelBody = new URLSearchParams({ uuid: task.odmUuid });
                await fetch(`${this.odmUrl}/task/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: cancelBody.toString(),
                });
            } catch (e) {
                this.logger.warn(`取消引擎任务失败: ${e.message}`);
            }
        }
        if (this.activePollers.has(id)) {
            clearInterval(this.activePollers.get(id)!);
            this.activePollers.delete(id);
        }
        await this.taskRepo.update(id, {
            status: ReconstructionStatus.CANCELED,
            stage: '已手动取消',
        });
        this.notifyTaskEvent('task_updated', {
            id,
            status: ReconstructionStatus.CANCELED,
            stage: '已手动取消',
        });
        return { success: true, message: '任务已取消' };
    }

    /**
     * 删除任务记录及本地所有成果与中间缓存（100% 彻底清理）
     */
    async removeTask(id: string) {
        const task = await this.findOne(id);
        if (this.activePollers.has(id)) {
            clearInterval(this.activePollers.get(id)!);
            this.activePollers.delete(id);
        }

        // 1. 彻底清理 NodeODM 引擎侧任务与 odm_data 物理缓存
        if (task.odmUuid) {
            try {
                const removeBody = new URLSearchParams({ uuid: task.odmUuid });
                await fetch(`${this.odmUrl}/task/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: removeBody.toString(),
                });
            } catch (e) {
                this.logger.warn(`通知 NodeODM 清理引擎任务提示: ${e.message}`);
            }

            try {
                const odmTaskDir = path.join(this.odmDataDir, task.odmUuid);
                if (fs.existsSync(odmTaskDir)) {
                    fs.rmSync(odmTaskDir, { recursive: true, force: true });
                }
            } catch (e) {
                this.logger.warn(`清理 odm_data 物理目录异常: ${e.message}`);
            }
        }

        // 2. 彻底清理任务专属存储目录 uploads/reconstruction/${id} (包含归档模型与原始包)
        const taskDir = path.resolve(process.cwd(), 'uploads/reconstruction', id);
        if (fs.existsSync(taskDir)) {
            fs.rmSync(taskDir, { recursive: true, force: true });
        }

        // 3. 从数据库彻底移除记录并广播删除事件
        await this.taskRepo.remove(task);
        this.notifyTaskEvent('task_deleted', { id });
        return { success: true, message: '任务及所有相关文件已彻底删除' };
    }
}
