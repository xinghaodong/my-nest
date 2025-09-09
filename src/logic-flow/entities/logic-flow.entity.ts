import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class LogicFlow {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    // 模板名称
    @Column({ length: 255 })
    name: string;

    // 描述
    @Column({ nullable: true })
    description?: string;

    // 存储 graphData
    @Column({ type: 'json' })
    graphData: Record<string, any>;

    // 状态
    @Column()
    status: string;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;
}
