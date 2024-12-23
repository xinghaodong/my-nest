import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('filelist')
export class FileList {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    fileName: string; // 文件名

    @Column()
    filePath: string; // 文件路径

    @Column()
    fileSize: number;

    @Column()
    contentType: string;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date; // 创建时间
}
