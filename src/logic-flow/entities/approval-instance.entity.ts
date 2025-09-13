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

  @Column({ type: 'int', default: 1 }) // 1=待审批, 2=通过, 3=拒绝, 4=退回
  status: number;

  @Column({ length: 255, nullable: true })
  currentNodeId: string; // 当前节点 ID

  @Column({ type: 'bigint' })
  applicantId: number; // 申请人 ID (sqr)

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

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}