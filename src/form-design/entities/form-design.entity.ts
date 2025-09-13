import { ApprovalInstance } from '@/src/logic-flow/entities/approval-instance.entity';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class FormDesign {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ length: 255 })
    name: string;

    // 描述
    @Column({ nullable: true })
    description?: string;

    @Column({ type: 'text' }) //  改为 text
    schema: string; //  改为 string，存储 JSON 字符串

    @Column({ type: 'json' })
    ui_config: Record<string, any>; // 保存 formConfig

    @Column({ default: '2' })
    status: string; // 0=草稿, 1=发布, 2=停用

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;

    @OneToMany(() => ApprovalInstance, instance => instance.form) // 添加这一行
    instances: ApprovalInstance[]; // 关联的审批实例
}
