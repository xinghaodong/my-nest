/**
 * 智能体领域与角色规范定义 (Domain:Role 命名空间体系)
 */
export const AGENT_ROLES = {
    // 💰 财务领域 (Finance Domain)
    FINANCE_INVOICE: 'finance:invoice_audit',       // 财务-发票验真与查重初审
    FINANCE_BUDGET: 'finance:budget_control',       // 财务-部门预算与额度管控
    FINANCE_ANTI_FRAUD: 'finance:anti_fraud',       // 财务-内控防舞弊审查
    FINANCE_JOINT_REVIEW: 'finance:joint_review',   // 财务-合议风控并行审查(并行调度发票+预算)

    // 📜 法务领域 (Legal Domain)
    LEGAL_CONTRACT: 'legal:business_contract',      // 法务-商务合同条款审查
    LEGAL_LABOR: 'legal:labor_compliance',          // 法务-劳动用工合规审查
    
    // 🏖️ 人事领域 (HR Domain)
    HR_LEAVE: 'hr:leave_attendance',                // 人事-请假与考勤冲突核验
} as const;

export type AgentRoleType = typeof AGENT_ROLES[keyof typeof AGENT_ROLES] | string;

/**
 * 历史别名兼容字典映射
 */
export const AGENT_ROLE_ALIASES: Record<string, string> = {
    'finance_reimbursement': AGENT_ROLES.FINANCE_INVOICE,
    'invoice_audit': AGENT_ROLES.FINANCE_INVOICE,
    'contract_review': AGENT_ROLES.LEGAL_CONTRACT,
    'hr_leave_audit': AGENT_ROLES.HR_LEAVE,
};

/**
 * 标准化角色标识
 */
export function normalizeAgentRole(role?: string): string {
    if (!role) return AGENT_ROLES.FINANCE_INVOICE;
    return AGENT_ROLE_ALIASES[role] || role;
}
