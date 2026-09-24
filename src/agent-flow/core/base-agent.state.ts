import { Annotation } from '@langchain/langgraph';
import { BaseAuditResult } from './base-agent.interface';

/**
 * 通用智能体 LangGraph 状态基础注解 (Base State)
 */
export const BaseAgentAnnotation = Annotation.Root({
    // 流程实例与表单信息
    instanceId: Annotation<number>(),
    formData: Annotation<Record<string, any>>(),
    files: Annotation<Array<{ name?: string; fileName?: string; filePath?: string; url?: string; size?: number }>>(),

    // 智能体基础属性
    agentRole: Annotation<string>(),       // 智能体角色标识
    agentRoleName: Annotation<string>(),   // 智能体中文名称
    riskThreshold: Annotation<number>(),   // 审核通过最低基准分（默认 80）

    // 运行状态与审计结果
    currentNodeId: Annotation<string>(),   // 当前流程图节点 ID
    status: Annotation<'running' | 'completed' | 'error'>(),
    auditResult: Annotation<BaseAuditResult | null>(),
    error: Annotation<string | null>(),
});

export type BaseAgentState = typeof BaseAgentAnnotation.State;
