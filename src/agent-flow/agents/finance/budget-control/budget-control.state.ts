import { Annotation } from '@langchain/langgraph';
import { BaseAuditResult } from '../../../core/base-agent.interface';

/**
 * 💰 财务领域：部门预算与额度管控 Agent 状态上下文 (State)
 */
export const BudgetControlAnnotation = Annotation.Root({
    instanceId: Annotation<number>(),
    formData: Annotation<Record<string, any>>(),
    files: Annotation<Array<any>>(),

    agentRole: Annotation<string>(),       // finance:budget_control
    agentRoleName: Annotation<string>(),   // "💰 财务-部门预算与额度管控专员"
    riskThreshold: Annotation<number>(),

    // 预算专项属性
    department: Annotation<string>(),      // 报销所属部门
    declaredAmount: Annotation<number>(),  // 申请金额
    quarterBudget: Annotation<number>(),   // 部门季度预算
    usedBudget: Annotation<number>(),      // 已使用预算
    isOverBudget: Annotation<boolean>(),   // 是否超标

    currentNodeId: Annotation<string>(),
    status: Annotation<'running' | 'completed' | 'error'>(),
    auditResult: Annotation<BaseAuditResult | null>(),
    error: Annotation<string | null>(),
});

export type BudgetControlState = typeof BudgetControlAnnotation.State;
