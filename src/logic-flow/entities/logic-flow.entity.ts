import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApprovalInstance } from './approval-instance.entity';

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

    // 关联表单ID
    @Column({ type: 'bigint', nullable: true })
    formId?: number;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;

    @OneToMany(() => ApprovalInstance, instance => instance.workflow) // 一对多
    instances: ApprovalInstance[]; // 关联的审批实例
}
