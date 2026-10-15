import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReconstructionStatus {
    PENDING = 'PENDING',         // 待处理（已接收上传）
    EXTRACTING = 'EXTRACTING',   // 解压航拍图片中
    UPLOADING = 'UPLOADING',     // 正在向 NodeODM 引擎上传图片
    QUEUED = 'QUEUED',           // 引擎排队中
    PROCESSING = 'PROCESSING',   // 正在三维重建
    SUCCESS = 'SUCCESS',         // 重建成功，3D Tiles 已生成
    FAILED = 'FAILED',           // 重建失败
    CANCELED = 'CANCELED',       // 用户手动取消
}

@Entity('reconstruction_tasks')
export class ReconstructionTask {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ length: 255, comment: '任务名称' })
    name: string;

    @Column({ length: 64, nullable: true, comment: '关联飞行任务/架次ID' })
    flightId?: string;

    @Column({
        type: 'enum',
        enum: ReconstructionStatus,
        default: ReconstructionStatus.PENDING,
        comment: '任务当前状态',
    })
    status: ReconstructionStatus;

    @Column({ type: 'float', default: 0, comment: '当前进度百分比 (0-100)' })
    progress: number;

    @Column({ length: 128, nullable: true, comment: '当前阶段描述 (例如: 特征匹配 / 稠密点云 / 网格分片)' })
    stage?: string;

    @Column({ length: 64, nullable: true, comment: 'NodeODM 引擎内部的任务 UUID' })
    odmUuid?: string;

    @Column({ length: 32, default: 'auto', comment: '运行模式: cpu | gpu | auto' })
    engineMode: string;

    @Column({ type: 'int', default: 0, comment: '有效航拍照片总数' })
    photoCount: number;

    @Column({ type: 'float', nullable: true, comment: '总耗时 (秒)' })
    processingTime?: number;

    @Column({ type: 'text', nullable: true, comment: '3D Tiles 相对或绝对入口 URL (tileset.json)' })
    tilesetUrl?: string;

    @Column({ type: 'json', nullable: true, comment: '提交给 NodeODM 的参数配置项' })
    options?: Record<string, any>;

    @Column({ type: 'text', nullable: true, comment: '失败原因或关键错误日志' })
    errorMessage?: string;

    @Column({ length: 500, nullable: true, comment: '上传的原始压缩包本地存储路径' })
    zipPath?: string;

    @Column({ length: 500, nullable: true, comment: '解压后的图片目录路径' })
    imagesDir?: string;

    @CreateDateColumn({ type: 'timestamp', comment: '创建时间' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp', comment: '更新时间' })
    updatedAt: Date;
}
