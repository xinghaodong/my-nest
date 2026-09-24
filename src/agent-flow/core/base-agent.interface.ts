/**
 * 违规/异常项定义
 */
export interface AuditAnomaly {
    type:
        | 'amount_mismatch'
        | 'duplicate_invoice'
        | 'invalid_tax_code'
        | 'fake_invoice'
        | 'consecutive_invoices'
        | 'overdue_invoice'
        | 'weekend_expense'
        | 'sensitive_keyword'
        | 'budget_exceeded'
        | 'contract_risk'
        | 'other';
    severity: 'low' | 'medium' | 'high';
    description: string;
    suggestion?: string;
}

/**
 * AI 智能体真实原话与决策凭证契约
 */
export interface AiRealSpeech {
    /** AI 大模型输出的核心审查总结原话 */
    summary: string;
    /** AI 大模型自己推导的事实与违规原因原话 */
    reasonCheck?: string;
    /** AI 大模型给出的专业整改处置建议 */
    suggestions?: string[];
    /** AI 大模型吐出的 100% 原始完整报文 (Raw Output) */
    rawOutput: string;
    /** 调用的模型名称 (如 glm-4-flash 或 qwen2.5:1.5b) */
    modelName?: string;
    /** 模型服务提供方 (如 zhipu 或 ollama) */
    provider?: string;
    /** 执行时间戳 */
    executedAt?: string;
}

/**
 * 人工特批记录
 */
export interface SpecialApprovalRecord {
    approved: boolean;
    approverId?: number;
    approverName?: string;
    comment?: string;
    approvedAt?: string;
    overdueDays?: number;
}

/**
 * 统一标准智能体审计结果契约
 */
export interface BaseAuditResult {
    pass: boolean;
    complianceScore: number;
    summary: string;
    /** 🌟 核心：无存疑异常项时的合规核验概括 (由各业务智能体自解释，供前端通用渲染，避免前端写死业务文案) */
    checkSummary?: string;
    anomalyList: AuditAnomaly[];
    details?: Record<string, any>;
    suggestions?: string[];
    rawModelResponse?: string;
    /** 🌟 核心：AI 真实说的话独立结构化对象 (存入数据库供审计回溯) */
    aiRealSpeech?: AiRealSpeech;

    /** 🌟 HITL 原生人机协同：当前图是否处于挂起等待人工特批状态 */
    isSuspended?: boolean;
    /** 挂起上下文详情 (如超期原因、要求审批人等) */
    suspendInfo?: {
        type: string;
        message: string;
        overdueDays?: number;
        invoiceDate?: string;
        requiredApproverRole?: string;
        [key: string]: any;
    };
    /** 特批履历 */
    specialApproval?: SpecialApprovalRecord;
}

/**
 * 智能体执行输入参数
 */
export interface AgentRunInput {
    instanceId: number;
    formData: Record<string, any>;
    files?: Array<{ name?: string; fileName?: string; filePath?: string; url?: string; size?: number }>;
    riskThreshold?: number;
    context?: Record<string, any>;
}

/**
 * 智能体断点恢复输入参数 (用于唤醒挂起的 LangGraph 中断)
 */
export interface AgentResumeInput {
    instanceId: number;
    approved: boolean;
    approverId?: number;
    approverName?: string;
    comment?: string;
    formData?: Record<string, any>;
    files?: any[];
    extraData?: Record<string, any>;
}

/**
 * 智能体状态图标准接口规范
 */
export interface IAgentGraph {
    /** 智能体唯一标识 (Domain:Role) */
    readonly role: string;

    /** 智能体可读名称 (如 "💰 财务-发票验真初审专员") */
    readonly roleName: string;

    /** 编译并构建 LangGraph 状态图 */
    buildGraph(): any;

    /** 执行智能体状态流转 */
    run(input: AgentRunInput): Promise<BaseAuditResult>;

    /** 唤醒并恢复挂起的智能体状态 (HITL Human-In-The-Loop) */
    resume?(input: AgentResumeInput): Promise<BaseAuditResult>;
}
