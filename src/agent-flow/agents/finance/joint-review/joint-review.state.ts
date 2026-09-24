import { Annotation } from '@langchain/langgraph';
import { BaseAuditResult } from '../../../core/base-agent.interface';

/**
 * 🤝 财务领域:合议风控并行审查 Agent 状态上下文 (State)
 *
 * 【并行字段拆分设计】
 *   prepare 节点后 fan-out 两条出边,invoice_node / budget_node 由 LangGraph 自动并行执行,
 *   两条入边汇聚到 aggregate 时 barrier 自动等齐。
 *
 *   - invoice_node 只写 invoiceResult,budget_node 只写 budgetResult,
 *     两者写不同 channel,默认 last-write-wins 策略下互不覆盖,无需自定义 reducer;
 *   - 共享字段(instanceId/formData/files/riskThreshold)由 prepare 写入,两个并行节点只读不写,无写冲突。
 */
export const JointReviewAnnotation = Annotation.Root({
    // 共享只读上下文 (prepare 写入, 两个并行节点只读)
    instanceId: Annotation<number>(),
    formData: Annotation<Record<string, any>>(),
    files: Annotation<Array<{ name?: string; fileName?: string; filePath?: string; url?: string; size?: number }>>(),
    riskThreshold: Annotation<number>(),

    // 并行分支专属字段 (字段拆分, 避免写冲突, 无需 reducer)
    invoiceResult: Annotation<BaseAuditResult | null>(),  // 仅 invoice_node 写
    budgetResult: Annotation<BaseAuditResult | null>(),    // 仅 budget_node 写

    // 合议最终汇聚结果 (仅 aggregate 节点写, 串行无 race)
    auditResult: Annotation<BaseAuditResult | null>(),

    // 智能体元信息
    agentRole: Annotation<string>(),       // finance:joint_review
    agentRoleName: Annotation<string>(),   // "🤝 财务-合议风控并行审查专员"

    // 流程控制
    currentNodeId: Annotation<string>(),
    status: Annotation<'running' | 'completed' | 'error'>(),
    error: Annotation<string | null>(),
});

export type JointReviewState = typeof JointReviewAnnotation.State;
