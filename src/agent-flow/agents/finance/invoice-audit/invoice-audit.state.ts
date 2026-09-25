import { Annotation } from '@langchain/langgraph';
import { BaseAuditResult, AuditAnomaly } from '../../../core/base-agent.interface';

/**
 * 重新导出通用异常和结果类型，方便调用方使用
 */
export { AuditAnomaly, BaseAuditResult };

/**
 * 财务发票验真初审 Agent 状态上下文 (State)
 */
export const InvoiceAuditAnnotation = Annotation.Root({
    // 流程实例与表单基础信息
    instanceId: Annotation<number>(),
    formData: Annotation<Record<string, any>>(),
    declaredAmount: Annotation<number>(),
    files: Annotation<Array<{ name?: string; fileName?: string; filePath?: string; url?: string; size?: number }>>(),
    invoiceFiles: Annotation<Array<{ name?: string; fileName?: string; filePath?: string; url?: string; size?: number }>>(),

    // 智能体配置
    agentRole: Annotation<string>(),       // 默认 finance:invoice_audit
    agentRoleName: Annotation<string>(),   // 默认 "💰 财务-发票验真与查重初审专员"
    riskThreshold: Annotation<number>(),   // 审核通过最低分，默认 80

    // 发票数据与特征提取
    extractedText: Annotation<string>(),   // 提取的发票文本/明细
    totalInvoiceAmount: Annotation<number>(), // 发票票面合计总金额
    invoiceDetails: Annotation<Array<{
        name: string;
        amount: number;
        text: string;
        invoiceNumber?: string;
        invoiceCode?: string;
        taxCode?: string;
        sellerName?: string;
        invoiceDate?: string;
        buyerName?: string;
        buyerTaxCode?: string;
    }>>(),

    // 确定性工具核验证据 (GB 32100 统一社会信用代码校验、数据库查重、连号排查、超期排查、购买方抬头校验)
    toolResults: Annotation<{
        taxCodeChecks?: any[];
        duplicationChecks?: any[];
        consecutiveChecks?: any[];
        overdueChecks?: any[];
        buyerChecks?: any[];
        hasCriticalFraud?: boolean;
        hasOverdue?: boolean;
        hasBuyerMismatch?: boolean;
        buyerMismatchDetail?: string;
        maxOverdueDays?: number;
        summaryNotes?: string[];
        fraudAlerts?: string[];
        passedNotes?: string[];
    }>(),

    // 🌟 HITL 人机协同中断与特批状态通道
    isSuspended: Annotation<boolean>(),
    overdueInfo: Annotation<{
        hasOverdue: boolean;
        maxOverdueDays: number;
        overdueList: any[];
        summary: string;
    } | null>(),
    specialApproval: Annotation<any | null>(), // 特批放行记录

    // 流程控制与最终结果
    currentNodeId: Annotation<string>(),
    status: Annotation<'running' | 'suspended' | 'completed' | 'error'>(),
    auditResult: Annotation<BaseAuditResult | null>(),
    error: Annotation<string | null>(),
});

export type InvoiceAuditState = typeof InvoiceAuditAnnotation.State;
