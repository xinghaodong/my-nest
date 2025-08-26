import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class VideoEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string; // 视频名称

    @Column()
    filepath: string; // 存储路径

    @Column('simple-array') // 存储帧图路径，逗号分隔
    frames?: string[];

    @Column({ unique: true }) // 确保唯一
    uploadId: string; // UUID

    @Column({ type: 'int', default: 1, nullable: true })
    fps: number;

    @Column({ type: 'float', nullable: true })
    duration?: number; // 秒

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, any>;
}
