// src/logic-flow/entities/approval-instance.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { LogicFlow } from './logic-flow.entity'; // 引用现有实体
import { FormDesign } from '../../form-design/entities/form-design.entity'; // 引用现有表单实体

@Entity('approval_instances')
export class ApprovalInstance {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ length: 255 })
    title: string; // 审批标题，例如 "请假申请 - 2025-09-15"

    @Column({ type: 'json', nullable: true })
    formData: Record<string, any>; // { startDate: "2025-09-15", days: "1.0", ... }

    @Column({ default: '0' }) // 0=AI审核中, 1=待审批, 2=通过, 3=拒绝
    status: string;

    @Column({ length: 255, nullable: true })
    currentNodeId: string; // 当前节点 ID

    @Column({ type: 'bigint' })
    applicantId: number; // 申请人 ID (sqr)

    @Column({ length: 255 })
    userName: string;

    @Column({ type: 'json', nullable: true })
    approvalHistory: Record<string, any>[]; // 审批记录

    @ManyToOne(() => LogicFlow, logicFlow => logicFlow.instances) // 多对一
    @JoinColumn({ name: 'workflowId' }) // 外键
    workflow: LogicFlow;

    @Column({ type: 'bigint' })
    workflowId: number; // 关联 logic_flow.id

    @ManyToOne(() => FormDesign, formDesign => formDesign.instances) // 多对一
    @JoinColumn({ name: 'formId' }) // 外键
    form: FormDesign;

    @Column({ type: 'bigint' })
    formId: number; // 关联 form_design.id

    // 当前审批人 ID (单人模式兼容)
    @Column({ type: 'bigint', nullable: true })
    currentApproverId: number;

    // 🌟 多人审批模式：'or' (或签/抢办: 一人通过即过), 'and' (会签: 全体通过才过)
    @Column({ length: 20, nullable: true, default: 'or' })
    approvalMode?: string;

    // 🌟 当前节点待审批人状态列表 (用于会签与或签追踪)
    // 结构: [{ userId: number, userName: string, status: 'pending'|'approved'|'rejected', comment?: string, operateTime?: string }]
    @Column({ type: 'json', nullable: true })
    currentApprovers?: Record<string, any>[];

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;
}
