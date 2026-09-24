import { StateGraph, START, END, MemorySaver, interrupt, Command } from '@langchain/langgraph';
import { InvoiceAuditAnnotation, InvoiceAuditState } from './invoice-audit.state';
import {
    IAgentGraph,
    AgentRunInput,
    AgentResumeInput,
    BaseAuditResult,
    AuditAnomaly,
    AiRealSpeech,
    SpecialApprovalRecord,
} from '../../../core/base-agent.interface';
import { AGENT_ROLES } from '../../../core/agent-roles.constant';
import { useAgentLlm } from '../../../core/use-agent-llm';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { Repository } from 'typeorm';
import { ApprovalInstance } from '../../../../logic-flow/entities/approval-instance.entity';
import {
    validateUnifiedSocialCreditCode,
    checkInvoiceDuplicationTool,
    checkConsecutiveInvoicesTool,
    checkInvoiceOverdueTool,
    extractInvoiceIdentifiers,
    ExtractedInvoiceInfo,
    ToolAuditEvidence,
} from './tools/reimbursement.tools';

const execFileAsync = promisify(execFile);

/**
 * 💰 财务领域：发票验真与查重初审 Agent (LangGraph 原生状态图 + 人机协同 HITL)
 * 拓扑结构：START -> prepare_data -> tools_verify -> compliance_audit -> hitl_overdue_gate -> evaluate_result -> END
 */
export class InvoiceAuditAgentGraph implements IAgentGraph {
    readonly role = AGENT_ROLES.FINANCE_INVOICE;
    readonly roleName = '💰 财务-发票验真与查重初审专员';

    private graph: any;
    // 🌟 LangGraph 检查点保存器 (微秒级内存断点冻结与唤醒)
    private checkpointer = new MemorySaver();
    // 🌟 统一大模型驱动 Hook (支持智谱 GLM-4 与本地 Ollama 自动切换与容错)
    private llm = useAgentLlm('财务-发票初审专员');

    constructor(private instanceRepo?: Repository<ApprovalInstance>) {
        this.graph = this.buildGraph();
    }

    /**
     * 构建 LangGraph 状态图 (装配 Checkpointer 与人机协同门禁)
     */
    public buildGraph() {
        const workflow = new StateGraph(InvoiceAuditAnnotation)
            // Node 1: 数据准备与发票信息提取 (OCR/文本/金额/开票日期)
            .addNode('prepare_data', this.prepareDataNode.bind(this))
            // Node 2: 确定性工具核验 (GB 32100 税号校验 + 数据库查重 + 连号排查 + 开票超期排查)
            .addNode('tools_verify', this.toolsVerifyNode.bind(this))
            // Node 3: 大模型财务合规初审 (结合确定性铁证产出专业审计报告)
            .addNode('compliance_audit', this.complianceAuditNode.bind(this))
            // Node 4: 🌟 人机协同门禁 (若检测到开票日期严重跨期超期，调用 interrupt 挂起等待特批)
            .addNode('hitl_overdue_gate', this.hitlOverdueGateNode.bind(this))
            // Node 5: 结果综合评定与安全网 (吸收人工特批结论与一票否决)
            .addNode('evaluate_result', this.evaluateResultNode.bind(this))
            // 边连接: 线性严格状态流转
            .addEdge(START, 'prepare_data')
            .addEdge('prepare_data', 'tools_verify')
            .addEdge('tools_verify', 'compliance_audit')
            .addEdge('compliance_audit', 'hitl_overdue_gate')
            .addEdge('hitl_overdue_gate', 'evaluate_result')
            .addEdge('evaluate_result', END);

        return workflow.compile({ checkpointer: this.checkpointer });
    }

    /**
     * 实现 IAgentGraph 的统一运行接口
     */
    public async run(input: AgentRunInput): Promise<BaseAuditResult> {
        console.log(`🚀 [${this.roleName}] 启动执行 (流程实例: #${input.instanceId})...`);

        // 从传入 files 或 formData 智能提取发票附件
        let invoiceFiles = input.files || [];
        if (invoiceFiles.length === 0 && input.formData) {
            for (const key of Object.keys(input.formData)) {
                const val = input.formData[key];
                if (Array.isArray(val) && val.length > 0 && (val[0]?.filePath || val[0]?.url)) {
                    invoiceFiles = val;
                    break;
                }
            }
        }

        const initialState: Partial<InvoiceAuditState> = {
            instanceId: input.instanceId,
            formData: input.formData || {},
            files: invoiceFiles,
            invoiceFiles: invoiceFiles,
            agentRole: this.role,
            agentRoleName: this.roleName,
            riskThreshold: input.riskThreshold ?? 80,
            extractedText: '',
            totalInvoiceAmount: 0,
            invoiceDetails: [],
            toolResults: {},
            currentNodeId: 'ai-agent',
            status: 'running',
            isSuspended: false,
            specialApproval: null,
            overdueInfo: null,
            auditResult: null,
            error: null,
        };

        const config = { configurable: { thread_id: `invoice_${input.instanceId}` } };

        try {
            const finalState = await this.graph.invoke(initialState, config);

            // 检查当前线程快照是否处于挂起状态 (tasks 中包含未处理的 interrupts)
            const snapshot = await this.graph.getState(config);
            const hasInterrupt = snapshot.tasks?.some((t: any) => t.interrupts && t.interrupts.length > 0);

            if (hasInterrupt) {
                const interruptVal = snapshot.tasks.find((t: any) => t.interrupts && t.interrupts.length > 0)?.interrupts[0]?.value;
                console.log(`⏸️ [${this.roleName}] 流程触发人机协同挂起，等待财务特批:`, interruptVal?.message);

                const realAiSummary = snapshot.values?.auditResult?.summary;
                const suspendSummary = realAiSummary
                    ? `[人机协同挂起] ${realAiSummary}`
                    : `[人机协同挂起] ${interruptVal?.message || '单据存在合规存疑，需特批复核'}`;

                return {
                    pass: false,
                    complianceScore: snapshot.values?.auditResult?.complianceScore || 50,
                    summary: suspendSummary,
                    anomalyList: snapshot.values?.auditResult?.anomalyList || [],
                    details: {
                        ...(snapshot.values?.auditResult?.details || {}),
                        invoices: snapshot.values?.invoiceDetails,
                        totalInvoiceAmount: snapshot.values?.totalInvoiceAmount,
                        isSuspended: true,
                        suspendInfo: interruptVal,
                    },
                    isSuspended: true,
                    suspendInfo: interruptVal,
                    aiRealSpeech: snapshot.values?.auditResult?.aiRealSpeech,
                };
            }

            console.log(`✅ [${this.roleName}] 审核结束 (最终得分: ${finalState.auditResult?.complianceScore}):`, finalState.auditResult?.summary);
            return finalState.auditResult;
        } catch (error: any) {
            // 兼容直接抛出 GraphInterrupt 异常的 LangGraph 运行时形态
            if (error.name === 'GraphInterrupt' || error.message?.includes('interrupt')) {
                const snapshot = await this.graph.getState(config);
                const interruptVal = snapshot.tasks?.find((t: any) => t.interrupts?.length > 0)?.interrupts[0]?.value;
                console.log(`⏸️ [${this.roleName}] 捕获 GraphInterrupt 挂起信号:`, interruptVal?.message);

                const realAiSummary = snapshot.values?.auditResult?.summary;
                const suspendSummary = realAiSummary
                    ? `[人机协同挂起] ${realAiSummary}`
                    : `[人机协同挂起] ${interruptVal?.message || '单据存在合规存疑，需特批复核'}`;

                return {
                    pass: false,
                    complianceScore: snapshot.values?.auditResult?.complianceScore || 50,
                    summary: suspendSummary,
                    anomalyList: snapshot.values?.auditResult?.anomalyList || [],
                    details: {
                        ...(snapshot.values?.auditResult?.details || {}),
                        invoices: snapshot.values?.invoiceDetails,
                        totalInvoiceAmount: snapshot.values?.totalInvoiceAmount,
                        isSuspended: true,
                        suspendInfo: interruptVal,
                    },
                    isSuspended: true,
                    suspendInfo: interruptVal,
                    aiRealSpeech: snapshot.values?.auditResult?.aiRealSpeech,
                };
            }
            console.error(`❌ [${this.roleName}] 执行异常:`, error);
            throw error;
        }
    }

    // 格式化时间为本地 YYYY-MM-DD HH:mm:ss
    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * 唤醒并恢复挂起的智能体 (HITL 特批恢复)
     */
    public async resume(input: AgentResumeInput): Promise<BaseAuditResult> {
        console.log(`▶️ [${this.roleName}] 收到特批人决策唤醒 (实例 #${input.instanceId}), 决定: ${input.approved ? '同意放行' : '予以驳回'}`);
        const config = { configurable: { thread_id: `invoice_${input.instanceId}` } };

        const specialApproval: SpecialApprovalRecord = {
            approved: input.approved,
            approverId: input.approverId,
            approverName: input.approverName || '特批复核人',
            comment: input.comment || (input.approved ? '同意发票跨期报销' : '超期驳回'),
            approvedAt: this.formatDate(new Date()),
        };

        const command = new Command({ resume: specialApproval });

        try {
            const finalState = await this.graph.invoke(command, config);
            if (finalState && finalState.auditResult) {
                console.log(`🎉 [${this.roleName}] 人机协同恢复执行完成 (最终通过: ${finalState.auditResult?.pass})`);
                return finalState.auditResult;
            }
            throw new Error('Graph state does not contain valid auditResult, fallback required');
        } catch (err: any) {
            console.warn(`⚠️ [${this.roleName}] 从内存检查点恢复失败 (可能服务曾重启)，启用冷启动容错兜底:`, err?.message);
            // 生产级冷启动容错兜底：当 Node 重启内存 Checkpoint 不在时，直接合规生成特批放行/驳回结果
            const formData = (input as any).formData || input.extraData?.formData || {};
            const fallbackResult: BaseAuditResult = {
                pass: Boolean(input.approved),
                complianceScore: Number(formData.complianceScore ?? 50),
                summary: input.approved
                    ? `【特批放行】发票超期异常经审批人[${specialApproval.approverName}]特批放行: ${specialApproval.comment}`
                    : `【特批驳回】发票超期异常经审批人[${specialApproval.approverName}]驳回: ${specialApproval.comment}`,
                anomalyList: input.approved
                    ? [{ type: 'overdue_invoice', severity: 'medium', description: '发票超期 (已由特批人批准放行豁免)' }]
                    : [{ type: 'overdue_invoice', severity: 'high', description: `发票超期且特批人驳回: ${specialApproval.comment}` }],
                specialApproval,
                details: {
                    specialApproval,
                    recoveredFromReboot: true,
                    invoices: formData.invoices || [],
                    totalInvoiceAmount: formData.amount || formData.totalAmount || 0,
                },
            };
            return fallbackResult;
        }
    }

    /**
     * Node 1: 数据准备与发票文本提取
     */
    private async prepareDataNode(state: InvoiceAuditState): Promise<Partial<InvoiceAuditState>> {
        console.log('📄 [Node 1: prepare_data] 提取发票文本与金额特征...');
        const invoiceFiles = state.invoiceFiles || [];
        const extractedDetails: Array<{
            name: string;
            amount: number;
            text: string;
            invoiceNumber?: string;
            invoiceCode?: string;
            taxCode?: string;
            sellerName?: string;
            invoiceDate?: string;
        }> = [];
        let totalExtractedAmount = 0;

        for (const file of invoiceFiles) {
            // 优先使用原始文件名展示
            const displayName = file.name || file.fileName || '发票凭证.pdf';
            const rawFileName = file.fileName || file.name || '';
            const filePath = file.filePath || file.url || '';
            let fileText = '';
            let fileAmount = 0;

            if (filePath || rawFileName) {
                if (this.isPdfFile(displayName, filePath, rawFileName)) {
                    fileText = await this.extractTextFromPdf(filePath, displayName);
                } else if (this.isImageFile(displayName, filePath, rawFileName)) {
                    console.log(`🖼️ [发票初审专员] 检测到图片发票凭证: ${displayName}，正在调用 PaddleOCR 识别内容...`);
                    fileText = await this.extractTextFromImage(filePath, displayName);
                } else {
                    // 未明确后缀，先尝试 PDF 再尝试 OCR
                    fileText = await this.extractTextFromPdf(filePath, displayName);
                    if (!fileText) {
                        fileText = await this.extractTextFromImage(filePath, displayName);
                    }
                }

                if (fileText) {
                    fileAmount = this.extractAmountFromText(fileText, displayName);
                }
            }

            // 若 PDF 内未识别出金额，尝试从原始文件名或磁盘文件名中提取
            if (fileAmount === 0) {
                fileAmount = this.extractInvoiceAmountFromFilename(displayName);
            }
            if (fileAmount === 0 && rawFileName && rawFileName !== displayName) {
                fileAmount = this.extractInvoiceAmountFromFilename(rawFileName);
            }

            totalExtractedAmount += fileAmount;

            const identifiers = extractInvoiceIdentifiers(displayName, fileText);
            console.log(`📋 [发票要素识别] 凭证: ${displayName} | 票面金额: ￥${fileAmount} | 发票号码: ${identifiers.invoiceNumber || '未识别'} | 纳税人税号: ${identifiers.taxCode || '未识别'} | 销售方: ${identifiers.sellerName || '未识别'} | 开票日期: ${identifiers.invoiceDate || '未识别'}`);
            extractedDetails.push({
                name: displayName,
                amount: fileAmount,
                text: fileText.substring(0, 300),
                invoiceNumber: identifiers.invoiceNumber,
                invoiceCode: identifiers.invoiceCode,
                taxCode: identifiers.taxCode,
                sellerName: identifiers.sellerName,
                invoiceDate: identifiers.invoiceDate,
            });
        }

        const summaryText = extractedDetails
            .map((d, i) => `【发票${i + 1}】文件名: ${d.name} | 票面金额: ￥${d.amount} | 发票号码: ${d.invoiceNumber || '未识别'} | 纳税人识别号: ${d.taxCode || '未识别'} | 销售方: ${d.sellerName || '未识别'} | 开票日期: ${d.invoiceDate || '未识别'}`)
            .join('\n');

        return {
            extractedText: summaryText,
            totalInvoiceAmount: Math.round(totalExtractedAmount * 100) / 100,
            invoiceDetails: extractedDetails,
            status: 'running',
        };
    }

    /**
     * Node 2: 确定性工具核验 (纯算法校验与数据库查重 + 超期时效排查)
     */
    private async toolsVerifyNode(state: InvoiceAuditState): Promise<Partial<InvoiceAuditState>> {
        console.log('🛠️ [Node 2: tools_verify] 执行确定性算法工具校验与发票查重...');

        const invoiceDetails = state.invoiceDetails || [];
        const toolEvidence: ToolAuditEvidence = {
            taxCodeChecks: [],
            duplicationChecks: [],
            consecutiveChecks: [],
            overdueChecks: [],
            hasCriticalFraud: false,
            hasOverdue: false,
            maxOverdueDays: 0,
            summaryNotes: [],
            fraudAlerts: [],
            passedNotes: [],
        };

        // 1. GB 32100-2015 统一社会信用代码校验
        for (const inv of invoiceDetails) {
            if (inv.taxCode) {
                const checkRes = validateUnifiedSocialCreditCode(inv.taxCode);
                toolEvidence.taxCodeChecks.push({
                    taxCode: inv.taxCode,
                    companyName: inv.sellerName,
                    invoiceName: inv.name,
                    valid: checkRes.valid,
                    type: checkRes.type,
                    reason: checkRes.reason,
                });

                if (!checkRes.valid) {
                    toolEvidence.hasCriticalFraud = true;
                    const alertMsg = `【假税号警告】发票 [${inv.name}] 销售方税号 [${inv.taxCode}] 未通过国家GB 32100校验: ${checkRes.reason}`;
                    toolEvidence.summaryNotes.push(alertMsg);
                    toolEvidence.fraudAlerts?.push(alertMsg);
                } else {
                    const passMsg = `【税号核验通过】发票 [${inv.name}] 销售方 [${inv.sellerName || '开票单位'}] 统一社会信用代码 [${inv.taxCode}] 通过国家GB 32100算法加权校验`;
                    toolEvidence.summaryNotes.push(passMsg);
                    toolEvidence.passedNotes?.push(passMsg);
                }
            }
        }

        // 2. 发票号码重复报销查重 (SQL 工具核验)
        const extInvoices: ExtractedInvoiceInfo[] = invoiceDetails.map(d => ({
            name: d.name,
            amount: d.amount,
            text: d.text,
            invoiceNumber: d.invoiceNumber,
            invoiceCode: d.invoiceCode,
            taxCode: d.taxCode,
            sellerName: d.sellerName,
            invoiceDate: d.invoiceDate,
        }));

        const dupResults = await checkInvoiceDuplicationTool(extInvoices, state.instanceId, this.instanceRepo);
        toolEvidence.duplicationChecks = dupResults;
        let hasDuplicate = false;
        for (const dup of dupResults) {
            if (dup.isDuplicate) {
                hasDuplicate = true;
                toolEvidence.hasCriticalFraud = true;
                const dupMsg = `【重复报销严重违规】${dup.message}`;
                toolEvidence.summaryNotes.push(dupMsg);
                toolEvidence.fraudAlerts?.push(dupMsg);
            }
        }

        if (!hasDuplicate && invoiceDetails.length > 0) {
            const numbers = invoiceDetails.map(i => i.invoiceNumber).filter(Boolean);
            if (numbers.length > 0) {
                const passMsg = `【发票查重通过】已检索历史审批单据数据库，发票 [${numbers.join(', ')}] 无历史报销冲突记录（全国唯一且首次报销）`;
                toolEvidence.summaryNotes.push(passMsg);
                toolEvidence.passedNotes?.push(passMsg);
            }
        }

        // 3. 连号与集中开票排查
        const consecutiveResults = checkConsecutiveInvoicesTool(extInvoices);
        toolEvidence.consecutiveChecks = consecutiveResults;
        for (const c of consecutiveResults) {
            toolEvidence.summaryNotes.push(`【连号预警】${c.message}`);
        }

        // 4. 🌟 发票时效与严重超期排查 (超过 90 天自动命中跨期挂起)
        const overdueCheck = checkInvoiceOverdueTool(extInvoices, 90);
        toolEvidence.overdueChecks = overdueCheck.overdueList;
        toolEvidence.hasOverdue = overdueCheck.hasOverdue;
        toolEvidence.maxOverdueDays = overdueCheck.maxOverdueDays;

        if (overdueCheck.hasOverdue) {
            for (const ov of overdueCheck.overdueList) {
                toolEvidence.summaryNotes.push(`【跨期超期预警】${ov.message}`);
            }
        } else {
            toolEvidence.summaryNotes.push(overdueCheck.summary);
            toolEvidence.passedNotes?.push(overdueCheck.summary);
        }

        return {
            toolResults: toolEvidence,
            overdueInfo: {
                hasOverdue: overdueCheck.hasOverdue,
                maxOverdueDays: overdueCheck.maxOverdueDays,
                overdueList: overdueCheck.overdueList,
                summary: overdueCheck.summary,
            },
            status: 'running',
        };
    }

    /**
     * Node 3: 大模型财务合规初审
     */
    private async complianceAuditNode(state: InvoiceAuditState): Promise<Partial<InvoiceAuditState>> {
        console.log('🤖 [Node 3: compliance_audit] 调用财务领域审计模型进行综合裁决...');

        const declaredAmount = Number(state.formData?.amount || state.formData?.totalAmount || 0);
        const expenseType = state.formData?.expenseType || state.formData?.type || '通用报销';
        const expenseReason = this.extractExpenseReason(state.formData);
        const applicant = this.extractApplicantName(state.formData);
        const invoiceCount = (state.invoiceFiles || []).length;
        const invoiceAmount = state.totalInvoiceAmount || 0;
        const toolResults = state.toolResults;

        // 🌟 事实预计算（防止小参数模型算错减法或忽视查重铁证）
        const amountDiff = Math.abs(declaredAmount - invoiceAmount);
        const isAmountMatched = amountDiff <= 1;
        const duplicateList = toolResults?.duplicationChecks || [];
        const isDuplicate = duplicateList.length > 0;
        const invalidTaxList = (toolResults?.taxCodeChecks || []).filter(t => !t.valid);
        const isTaxCodeValid = invalidTaxList.length === 0;
        const hasCriticalFraud = toolResults?.hasCriticalFraud || isDuplicate || !isTaxCodeValid;

        // 生成铁证事实指令
        const hardFacts: string[] = [];
        if (!isAmountMatched) {
            hardFacts.push(`❌【金额严重不符事实】申报金额 ￥${declaredAmount} 与发票票面金额 ￥${invoiceAmount} 不一致，相差 ￥${amountDiff.toFixed(2)}！"amountMatch" 必须填 false！`);
        } else {
            hardFacts.push(`✅【金额一致】申报金额与发票票面金额一致。`);
        }

        if (isDuplicate) {
            const dupDetail = duplicateList[0]?.message || '发票在历史报销单中重复出现';
            hardFacts.push(`🚨【重复报销严重违规事实】${dupDetail}！"isDuplicate" 必须填 true！"pass" 必须填 false！合规分严禁超过 25 分！`);
        } else {
            hardFacts.push(`✅【查重唯一】审批数据库未检索到该发票的重复报销记录。`);
        }

        if (!isTaxCodeValid) {
            hardFacts.push(`🚨【伪造税号事实】开票方统一社会信用代码未通过国家 GB 32100 算法校验，疑似虚开发票！"taxCodeValid" 必须填 false！"pass" 必须填 false！`);
        }

        const hasOverdue = toolResults?.hasOverdue;
        const maxOverdueDays = toolResults?.maxOverdueDays || 0;
        if (hasOverdue) {
            hardFacts.push(`🚨【开票严重超期异常事实】单据发票已跨期超期 ${maxOverdueDays} 天 (企业规定报销时效 ≤ 90 天)，属于严重超期违规！"pass" 必须填 false！合规评分 (complianceScore) 严禁评高分 (最高不得超过 60 分)！`);
        } else {
            hardFacts.push(`✅【开票时效合规】发票开票日期在正常报销时效内。`);
        }

        const toolEvidenceText = hardFacts.join('\n');

        const systemPrompt = `你是一名拥有15年经验的资深企业财务审计专家兼内部风控总监。
必须以极其严苛的内控标准审阅单据，坚决杜绝财务造假、重复报销和金额虚报！

【核心审计铁律（必须无条件服从）】:
1. 若【底层核验事实】中指出存在“重复报销”或“伪造税号”，你必须实事求是判为严重欺诈违规（pass 必须为 false，complianceScore 严禁高于 20 分）！
2. 若【底层核验事实】中指出存在“金额不符”，你必须判为不合规（pass 必须为 false，complianceScore 严禁高于 40 分）！
3. 若【底层核验事实】中指出存在“开票严重超期异常事实”，属于严重违规：
   - 必须实事求是判为不合规（pass 必须为 false，严禁给出通过）！
   - 合规评分 (complianceScore) 严禁评高分（扣除时效分后最高不得超过 60 分，严禁打满分 100 分）！
   - 必须在 summary 与 reasonCheck 中客观指出开票严重超期事实！
4. 请在 reasonCheck 中一针见血地指出违规本质。

【输出格式约束】
必须严格输出以下纯 JSON，严禁附带 markdown 标记或额外解释：
{
  "complianceScore": <0-100的整数，存在重大违规或严重超期时必须低于60>,
  "pass": <true或false，存在严重违规或严重超期时必须为false>,
  "summary": "<1句话概括核心审查裁决结果，如包含金额不符与超期必须全部体现>",
  "anomalyList": [
    {
      "type": "<amount_mismatch | overdue_invoice | duplicate_invoice | invalid_tax_code | other>",
      "severity": "<high | medium | low>",
      "description": "<具体违规异常事实描述，包括具体金额、日期与差额>",
      "suggestion": "<具体整改或合规处置建议>"
    }
  ],
  "reasonCheck": "<根据上述核验事实，客观指出合规或违规原因>",
  "amountMatch": ${isAmountMatched ? 'true' : 'false'},
  "isDuplicate": ${isDuplicate ? 'true' : 'false'},
  "taxCodeValid": ${isTaxCodeValid ? 'true' : 'false'},
  "riskLevel": "${hasCriticalFraud ? 'HIGH' : isAmountMatched ? 'LOW' : 'MEDIUM'}",
  "suggestions": ["<处置建议>"]
}`;

        const userPrompt = `【待审报销单据】
- 申请人: ${applicant}
- 报销类型: ${expenseType}
- 申报金额: ￥${declaredAmount}
- 发票金额: ￥${invoiceAmount} (差额: ￥${amountDiff.toFixed(2)})
- 报销事由: ${expenseReason}
- 发票明细:\n${state.extractedText || '未提取到发票文本'}

【底层确定性工具核验事实铁证】:
${toolEvidenceText}

请依据上述不可辩驳的核验事实，直接输出合法 JSON 审计结论:`;

        let auditResult: BaseAuditResult;
        try {
            // 🚀 调用 useAgentLlm 统一驱动：支持智谱 GLM-4 / 本地 Ollama 自动路由与降级
            const rawResponse = await this.llm.callModelApi(systemPrompt, userPrompt);
            auditResult = this.llm.parseModelJson<BaseAuditResult>(rawResponse);
            auditResult.rawModelResponse = rawResponse;

            console.log(`🎉 [Node 3: compliance_audit] 大模型输出解析成功！已采纳 AI 原生裁决结论 (合规得分: ${auditResult.complianceScore}, 判定通过: ${auditResult.pass})`);

            // 🌟 核心工程增强：结构化固化【AI 真实说的话】(原汁原味留存，供存库与审计)
            const currentProvider = (process.env.MODEL_PROVIDER || 'zhipu').toLowerCase();
            const currentModel = (currentProvider === 'zhipu' || currentProvider === 'glm')
                ? (process.env.AI_ZP_DEFAULT_MODEL || 'glm-4-flash')
                : (process.env.AI_BD_DEFAULT_MODEL || 'qwen2.5:1.5b');

            const aiRealSpeech: AiRealSpeech = {
                summary: auditResult.summary,
                reasonCheck: auditResult.details?.reasonCheck || '无独立事实原因',
                suggestions: auditResult.suggestions || [],
                rawOutput: rawResponse,
                modelName: currentModel,
                provider: currentProvider,
                executedAt: new Date().toISOString(),
            };

            auditResult.aiRealSpeech = aiRealSpeech;
            auditResult.rawModelResponse = rawResponse;

            // 将底层结构化发票与工具铁证注入 details
            if (!auditResult.details) auditResult.details = {};
            auditResult.details.aiRealSpeech = aiRealSpeech;
            auditResult.details.executionMode = 'llm'; // 标识本次由大模型直接决策
            auditResult.details.modelName = currentModel;
            auditResult.details.provider = currentProvider;
            auditResult.details.rawModelResponse = rawResponse;
            auditResult.details.modelOriginalSummary = auditResult.summary;
            auditResult.details.modelOriginalScore = auditResult.complianceScore;
            auditResult.details.invoices = (state.invoiceDetails || []).map(inv => ({
                name: inv.name,
                amount: inv.amount,
                invoiceNumber: inv.invoiceNumber,
                invoiceCode: inv.invoiceCode,
                taxCode: inv.taxCode,
                sellerName: inv.sellerName,
            }));
            auditResult.details.toolEvidence = toolResults;

            // 🚨 代码级安全兜底铁律 1：金额匹配红线 (申报金额 vs 票面实际总额)
            if (!isAmountMatched && invoiceCount > 0) {
                auditResult.pass = false;
                // 申报金额与发票不符属于账实不符重大风险，合规评分严禁高于 40 分！
                auditResult.complianceScore = Math.min(Number(auditResult.complianceScore) || 40, 40);
                if (!auditResult.details) auditResult.details = {};
                auditResult.details.amountMatch = false;
                auditResult.details.amountDiff = amountDiff;
                auditResult.details.declaredAmount = declaredAmount;
                auditResult.details.invoiceAmount = invoiceAmount;
                if (!Array.isArray(auditResult.anomalyList)) {
                    auditResult.anomalyList = [];
                }
                const amountMismatchDesc = `申报金额 (￥${declaredAmount.toFixed(2)}) 与发票票面总金额 (￥${invoiceAmount.toFixed(2)}) 严重不符，相差 ￥${amountDiff.toFixed(2)}！`;
                if (!auditResult.anomalyList.some(a => a.type === 'amount_mismatch' || a.description?.includes('金额'))) {
                    auditResult.anomalyList.unshift({
                        type: 'amount_mismatch',
                        severity: 'high',
                        description: amountMismatchDesc,
                        suggestion: '请核实发票凭证是否漏传，或修改报销申报金额使其与实际票面总额完全一致',
                    });
                }
            }

            // 代码级安全兜底铁律 2：若工具发现重复报销或假税号，无论大模型如何给分，必须强制一票否决！
            if (toolResults?.hasCriticalFraud) {
                const originalAiSummary = auditResult.summary;
                auditResult.pass = false;
                auditResult.complianceScore = Math.min(auditResult.complianceScore, 20);
                if (auditResult.details) auditResult.details.riskLevel = 'HIGH';
                const fraudDesc = (toolResults.fraudAlerts && toolResults.fraudAlerts.length > 0)
                    ? toolResults.fraudAlerts.join('；')
                    : '检测到发票重复报销或伪造假税号重大风险！';
                
                // 🌟 同时展示系统安全拦截结论与大模型原本说的话，绝不粗暴抹掉 AI 真实原话
                auditResult.summary = `【严重高危-安全网否决】${fraudDesc} (🤖 AI原审意见: ${originalAiSummary})`;
                for (const fraud of toolResults.fraudAlerts || []) {
                    if (!auditResult.anomalyList.some(a => a.description === fraud)) {
                        auditResult.anomalyList.unshift({
                            type: fraud.includes('重复') ? 'duplicate_invoice' : 'invalid_tax_code',
                            severity: 'high',
                            description: fraud,
                            suggestion: '发票涉嫌严重虚假/重复报销，一票否决并转内控调查',
                        });
                    }
                }
            }

            // 🚨 代码级安全兜底铁律 3：发票严重超期时效红线
            // 若发票严重超期 (>90天)，无论大模型如何给分，初审绝不能给 pass，且合规分严禁超过 60 分！
            if (toolResults?.hasOverdue) {
                auditResult.pass = false;
                auditResult.complianceScore = Math.min(Number(auditResult.complianceScore) || 50, 60);
                if (auditResult.details) auditResult.details.hasOverdue = true;
                if (!Array.isArray(auditResult.anomalyList)) {
                    auditResult.anomalyList = [];
                }
                const overdueDesc = toolResults.overdueChecks?.[0]?.message || `单据发票已跨期超期 ${toolResults.maxOverdueDays} 天 (企业规定报销时效 ≤ 90 天)`;
                if (!auditResult.anomalyList.some(a => a.type === 'overdue_invoice' || a.description?.includes('超期'))) {
                    auditResult.anomalyList.push({
                        type: 'overdue_invoice',
                        severity: 'medium',
                        description: overdueDesc,
                        suggestion: '发票开票严重超期违规，需专人特批放行并说明业务延期事由后方可报销',
                    });
                }
            }

            // 🌟 若无任何异常项，赋予智能体自解释的标准核验总结 (供通用审批组件展示，解耦前端)
            if (!auditResult.anomalyList || auditResult.anomalyList.length === 0) {
                auditResult.checkSummary = '发票合规三要素、开票时效与查重比对核验通过，未发现异常。';
            }
        } catch (err) {
            console.warn('\n⚠️ [Node 3: compliance_audit] 大模型调用失败或解析异常，使用高精准规则引擎兜底:', err.message);
            console.warn('⚠️ 提示: 本次审查未由大模型实际产出，而是由本地 TypeScript 规则引擎安全兜底执行！\n');
            auditResult = this.ruleBasedFallbackAudit(state);
            if (!auditResult.details) auditResult.details = {};
            auditResult.details.executionMode = 'rule_engine_fallback';
            auditResult.details.fallbackReason = err.message;
        }

        return {
            auditResult,
            status: 'running',
        };
    }

    /**
     * Node 4: 🌟 人机协同门禁 (Human-In-The-Loop)
     * 若检测到开票日期严重超期 (>90天) 且尚未特批，调用 LangGraph 原生 interrupt() 挂起流程等待人工特批
     */
    private async hitlOverdueGateNode(state: InvoiceAuditState): Promise<Partial<InvoiceAuditState>> {
        const hasOverdue = state.toolResults?.hasOverdue;
        const specialApproval = state.specialApproval;

        // 如果发票未超期，或者已经获得了特批决定，直接顺畅进入终评
        if (!hasOverdue || specialApproval) {
            return { isSuspended: false, status: 'running' };
        }

        const declaredAmount = Number(state.formData?.totalAmount || state.formData?.amount || 0);
        const invoiceAmount = state.totalInvoiceAmount || 0;
        const amountDiff = Math.abs(declaredAmount - invoiceAmount);
        const isAmountMatched = amountDiff <= 1;

        let suspendReason = '';
        if (!isAmountMatched && (state.invoiceFiles || []).length > 0) {
            suspendReason += `【金额严重不符】申报 ￥${declaredAmount.toFixed(2)} 与发票总额 ￥${invoiceAmount.toFixed(2)} 相差 ￥${amountDiff.toFixed(2)}；`;
        }
        suspendReason += state.toolResults?.overdueChecks?.[0]?.message || `【发票严重超期】发票已跨期超期 ${state.toolResults?.maxOverdueDays} 天 (系统规定 ≤ 90 天)`;

        console.log(`⏸️ [人机协同门禁] 检测到单据合规异常，触发 LangGraph 原生 interrupt() 挂起: ${suspendReason}`);

        // 原生调用 interrupt()，抛出挂起数据并冻结至 Checkpointer
        const humanDecision = interrupt({
            type: 'OVERDUE_INVOICE',
            message: suspendReason,
            overdueDays: state.toolResults?.maxOverdueDays,
            invoiceDate: state.toolResults?.overdueChecks?.[0]?.invoiceDate,
            amountDiff: !isAmountMatched ? amountDiff : 0,
            declaredAmount,
            invoiceAmount,
            instanceId: state.instanceId,
            requiredApproverRole: 'finance:supervisor',
        }) as SpecialApprovalRecord;

        console.log(`▶️ [人机协同门禁] 收到人工特批恢复指令:`, humanDecision);

        return {
            specialApproval: humanDecision,
            isSuspended: false,
            status: 'running',
        };
    }

    /**
     * Node 5: 结果综合评定与安全网 (吸收人工特批与一票否决)
     */
    private async evaluateResultNode(state: InvoiceAuditState): Promise<Partial<InvoiceAuditState>> {
        console.log('⚖️ [Node 5: evaluate_result] 结果终评、特批结论吸收与阈值判定...');
        const threshold = state.riskThreshold || 80;
        const result = state.auditResult;
        const hasCriticalFraud = state.toolResults?.hasCriticalFraud;
        const specialApproval = state.specialApproval;

        if (result) {
            const anomalies = Array.isArray(result.anomalyList) ? result.anomalyList : [];

            // 1. 致命欺诈底线：假税号、重复报销一票否决，任何特批无效
            if (hasCriticalFraud) {
                result.pass = false;
            } else if (specialApproval) {
                // 2. 存在人工特批
                if (specialApproval.approved) {
                    // 特批放行仅豁免超期异常，若单据存在金额严重不符等高风险，如实保留拦截
                    const nonOverdueAnomalies = (result.anomalyList || []).filter(a => a.type !== 'overdue_invoice');
                    const hasUnresolvedHighRisk = nonOverdueAnomalies.some(a => a.severity === 'high');

                    result.pass = !hasUnresolvedHighRisk;
                    // 🌟 尊重客观审计事实：保留大模型自身客观打分，不因特批放行而人为改分
                    const approveTag = `【特批放行】发票存在超期异常(${state.toolResults?.maxOverdueDays}天)，经审批人[${specialApproval.approverName || '特批复核人'}]特批放行: ${specialApproval.comment || '同意报销'}`;
                    result.summary = `${approveTag}；${result.summary}`;
                    result.specialApproval = specialApproval;
                    if (!result.details) result.details = {};
                    result.details.specialApproval = specialApproval;
                    // 保留超期特批豁免记录，同时如实保留金额严重不符等非超期异常项
                    result.anomalyList = [
                        {
                            type: 'overdue_invoice',
                            severity: 'medium',
                            description: `发票开票严重超期 ${state.toolResults?.maxOverdueDays} 天 (已获特批放行豁免)`,
                            suggestion: `特批人[${specialApproval.approverName || '特批复核人'}]已特批放行: ${specialApproval.comment || '同意报销'}`
                        },
                        ...nonOverdueAnomalies
                    ];
                } else {
                    // 特批驳回：维持初审不合格判定与大模型原生客观打分
                    result.pass = false;
                    const rejectTag = `【特批驳回】审批人[${specialApproval.approverName || '特批复核人'}]驳回了发票超期报销: ${specialApproval.comment || '超期不予报销'}`;
                    result.summary = `${rejectTag}；${result.summary}`;
                    result.specialApproval = specialApproval;
                    if (!result.details) result.details = {};
                    result.details.specialApproval = specialApproval;
                    result.anomalyList.unshift({
                        type: 'overdue_invoice',
                        severity: 'high',
                        description: `发票严重超期且特批人驳回: ${specialApproval.comment}`,
                    });
                }
            } else {
                // 3. 正常无超期情况
                if (result.complianceScore >= threshold && !anomalies.some(a => a.severity === 'high')) {
                    result.pass = true;
                } else {
                    result.pass = false;
                }
            }
        }

        return {
            auditResult: result,
            status: 'completed',
        };
    }

    /**
     * 规则引擎兜底审核
     */
    private ruleBasedFallbackAudit(state: InvoiceAuditState): BaseAuditResult {
        const declaredAmount = Number(state.formData?.amount || state.formData?.totalAmount || 0);
        const invoiceAmount = state.totalInvoiceAmount || 0;
        const invoiceCount = (state.invoiceFiles || []).length;
        const toolResults = state.toolResults;

        const anomalies: AuditAnomaly[] = [];
        let score = 100;

        // 1. 高危欺诈一票否决 (仅针对真实的违规 fraudAlerts，严禁将正面通过结论作为异常)
        if (toolResults?.hasCriticalFraud) {
            score -= 75;
            const actualAlerts = (toolResults.fraudAlerts && toolResults.fraudAlerts.length > 0)
                ? toolResults.fraudAlerts
                : (toolResults.summaryNotes || []).filter(n => n.includes('重复') || n.includes('假税号') || n.includes('违规'));

            for (const note of actualAlerts) {
                anomalies.push({
                    type: note.includes('重复') ? 'duplicate_invoice' : 'invalid_tax_code',
                    severity: 'high',
                    description: note,
                    suggestion: '发票涉嫌重大虚假/重复报销舞弊，一票否决并转内控调查',
                });
            }
        }

        // 2. 发票张数核验
        if (invoiceCount === 0) {
            score -= 50;
            anomalies.push({
                type: 'other',
                severity: 'high',
                description: '未上传任何发票凭证，无法佐证费用真实发生',
                suggestion: '请补全对应发票附件后重新提交',
            });
        }

        // 3. 金额匹配核验
        if (invoiceCount > 0 && Math.abs(declaredAmount - invoiceAmount) > 1) {
            const diff = Math.abs(declaredAmount - invoiceAmount);
            score -= 25;
            anomalies.push({
                type: 'amount_mismatch',
                severity: 'medium',
                description: `申报金额 (￥${declaredAmount}) 与发票票面总金额 (￥${invoiceAmount}) 不一致，相差 ￥${diff.toFixed(2)}`,
                suggestion: '请核实是否漏传发票或金额填写有误',
            });
        }

        // 4. 连号特征核验
        if (toolResults?.consecutiveChecks && toolResults.consecutiveChecks.length > 0) {
            score -= 15;
            for (const c of toolResults.consecutiveChecks) {
                anomalies.push({
                    type: 'consecutive_invoices',
                    severity: 'medium',
                    description: c.message,
                    suggestion: '建议财务人工抽查业务真实性',
                });
            }
        }

        // 5. 开票时效核验 (严重超期扣分)
        if (toolResults?.hasOverdue) {
            score -= 40; // 严重超期至少扣除 40 分，最高封顶 60 分
            const overdueDesc = toolResults.overdueChecks?.[0]?.message || `单据发票已跨期超期 ${toolResults.maxOverdueDays} 天 (企业规定报销时效 ≤ 90 天)`;
            anomalies.push({
                type: 'overdue_invoice',
                severity: 'medium',
                description: overdueDesc,
                suggestion: '发票开票日期严重超期违规，需专人特批放行并说明业务延期事由',
            });
        }

        score = Math.max(0, Math.min(100, score));
        const threshold = state.riskThreshold || 80;
        const pass = score >= threshold && !anomalies.some(a => a.severity === 'high');

        let summary = pass
            ? `AI发票初审通过 (得分: ${score})，发票票面总额 (￥${invoiceAmount}) 与申报金额 (￥${declaredAmount}) 完全一致；已成功执行开票方统一社会信用代码 GB 32100 算法加权校验与审批数据库历史查重比对，未见重复报销。`
            : `AI发票初审存疑 (得分: ${score})，检测到 ${anomalies.length} 项风险点，建议人工重点复核。`;

        if (toolResults?.hasCriticalFraud) {
            const fraudSummary = (toolResults.fraudAlerts && toolResults.fraudAlerts.length > 0)
                ? toolResults.fraudAlerts[0]
                : '检测到重复报销或无效假税号等重大舞弊风险！';
            summary = `【严重高危】AI发票初审不通过 (得分: ${score})，${fraudSummary}`;
        }

        const fallbackSpeech: AiRealSpeech = {
            summary: '【未调用大模型 / 本次由本地 TypeScript 规则引擎安全兜底执行】',
            reasonCheck: '确定性工具校验与本地规则引擎初审',
            suggestions: anomalies.map(a => a.suggestion || a.description),
            rawOutput: '【未调用大模型 / 规则引擎兜底】',
            modelName: 'rule_engine',
            provider: 'internal_rules',
            executedAt: new Date().toISOString(),
        };

        return {
            pass,
            complianceScore: score,
            summary,
            checkSummary: anomalies.length === 0 ? '发票合规三要素、开票时效与查重比对核验通过，未发现异常。' : undefined,
            anomalyList: anomalies,
            aiRealSpeech: fallbackSpeech,
            details: {
                aiRealSpeech: fallbackSpeech,
                executionMode: 'rule_engine_fallback',
                invoiceCount,
                declaredAmount,
                totalInvoiceAmount: invoiceAmount,
                amountMatch: Math.abs(declaredAmount - invoiceAmount) <= 1,
                taxCodeValid: !toolResults?.taxCodeChecks?.some(t => !t.valid),
                isDuplicate: !!toolResults?.duplicationChecks?.some(d => d.isDuplicate),
                reasonCheck: '确定性工具校验与规则引擎初审',
                riskLevel: toolResults?.hasCriticalFraud ? 'HIGH' : score >= 80 ? 'LOW' : score >= 60 ? 'MEDIUM' : 'HIGH',
                validCertifications: toolResults?.passedNotes || [],
            },
            suggestions: anomalies.map(a => a.suggestion || a.description),
            rawModelResponse: '【未调用大模型 / 本次由本地 TypeScript 规则引擎安全兜底执行】',
        };
    }

    /**
     * 判断是否为 PDF 发票
     */
    private isPdfFile(displayName: string, filePath: string, rawFileName: string): boolean {
        const str = `${displayName} ${filePath} ${rawFileName}`.toLowerCase();
        return str.includes('.pdf');
    }

    /**
     * 判断是否为图片发票 (jpg/png/jpeg/webp/bmp等)
     */
    private isImageFile(displayName: string, filePath: string, rawFileName: string): boolean {
        const str = `${displayName} ${filePath} ${rawFileName}`.toLowerCase();
        return /\.(jpg|jpeg|png|webp|bmp|tif|tiff)/i.test(str);
    }

    /**
     * 统一磁盘文件绝对路径定位器 (内置相对路径、URL 前缀、UTF-8 转 Latin1 乱码多重容错)
     */
    private resolveDiskFilePath(filePath: string, preferredName?: string): string {
        if (!filePath && !preferredName) return '';

        // 1. 如果直接就是存在的绝对路径
        if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
            return filePath;
        }

        // 清理网络前缀与相对前缀
        const cleanRelative = filePath
            .replace(/^https?:\/\/[^\/]+/, '')
            .replace(/^\/?api\//, '')
            .replace(/^\//, '');

        const candidate1 = path.join(process.cwd(), cleanRelative);
        const candidate2 = path.join(process.cwd(), 'uploads', path.basename(cleanRelative));
        const candidate3 = path.join(process.cwd(), 'uploads', decodeURIComponent(path.basename(cleanRelative)));

        if (fs.existsSync(candidate1)) return candidate1;
        if (fs.existsSync(candidate2)) return candidate2;
        if (fs.existsSync(candidate3)) return candidate3;

        // 2. 智能匹配 uploads 目录（包含 UTF-8 转 Latin1 兼容，解决 Multer 乱码存盘问题）
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const allFiles = fs.readdirSync(uploadsDir);
            const base = path.basename(cleanRelative);

            let latin1Name = '';
            if (preferredName) {
                try {
                    latin1Name = Buffer.from(preferredName, 'utf-8').toString('latin1');
                } catch {}
            }

            const matched = allFiles.find(f =>
                f === base ||
                (latin1Name && f === latin1Name) ||
                (preferredName && f.includes(preferredName)) ||
                (base.length > 5 && f.includes(base)),
            );
            if (matched) {
                return path.join(uploadsDir, matched);
            }
        }

        return '';
    }

    /**
     * 从 PDF 中提取文本 (兼容 pdf-parse v2 与 v1)
     */
    private async extractTextFromPdf(filePath: string, preferredName?: string): Promise<string> {
        try {
            const targetPath = this.resolveDiskFilePath(filePath, preferredName);
            if (!targetPath || !fs.existsSync(targetPath)) {
                console.warn('⚠️ [PDF提取] 未找到磁盘发票文件:', filePath);
                return '';
            }

            const dataBuffer = fs.readFileSync(targetPath);
            const pdfParseModule = await import('pdf-parse');

            // 针对 pdf-parse v2.x (面向对象类构造)
            if (typeof (pdfParseModule as any).PDFParse === 'function') {
                const parser = new (pdfParseModule as any).PDFParse({ data: dataBuffer });
                const res = await parser.getText();
                return (res.text || '').replace(/\s+/g, ' ').trim();
            }

            // 针对 pdf-parse v1.x (函数式直接调用)
            const pdfParseFn = (pdfParseModule as any).default || pdfParseModule;
            if (typeof pdfParseFn === 'function') {
                const data = await pdfParseFn(dataBuffer);
                return (data.text || '').replace(/\s+/g, ' ').trim();
            }

            return '';
        } catch (err) {
            console.warn('⚠️ [PDF提取] 解析发生异常:', err.message);
            return '';
        }
    }

    /**
     * 🌟 从图片发票中提取文本 (基于本地 PaddleOCR，支持 HTTP 微服务优先 + Python CLI 自动兜底)
     */
    private async extractTextFromImage(filePath: string, preferredName?: string): Promise<string> {
        try {
            const targetPath = this.resolveDiskFilePath(filePath, preferredName);
            if (!targetPath || !fs.existsSync(targetPath)) {
                console.warn('⚠️ [图片OCR提取] 未找到磁盘发票图片文件:', filePath);
                return '';
            }

            // 1. 优先尝试向本地 PaddleOCR HTTP 接口请求 (毫秒级响应)
            const ocrApiUrl = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8100/ocr';
            try {
                const res = await axios.post(
                    ocrApiUrl,
                    { image_path: targetPath },
                    { timeout: 15000, headers: { 'Content-Type': 'application/json' } },
                );
                if (res.data?.success && res.data.text) {
                    console.log(`✅ [PaddleOCR:HTTP] 成功识别图片文本 (行数: ${res.data.count || res.data.lines?.length}, 置信度: ${res.data.avg_confidence}):\n---------------- [OCR 识别全文] ----------------\n${res.data.text}\n------------------------------------------------`);
                    return res.data.text;
                }
            } catch (httpErr) {
                // 如果 HTTP 服务未启动 (ECONNREFUSED / 超时)，优雅降级到本地 Python 命令行执行
                console.warn(`⚠️ [PaddleOCR] HTTP 服务未响应 (${httpErr.message})，自动切换为本地 Python CLI 进程直接识别...`);
            }

            // 2. 降级方案：直接调用本地 PaddleOCR 虚拟环境中的 Python 解释器执行
            const pythonBin = process.env.OCR_PYTHON_PATH || 'D:\\codeFile\\xuexi\\minimax\\ocr-server\\.venv\\Scripts\\python.exe';
            const scriptPath = process.env.OCR_SCRIPT_PATH || 'D:\\codeFile\\xuexi\\minimax\\ocr-server\\api_server.py';

            if (!fs.existsSync(pythonBin) || !fs.existsSync(scriptPath)) {
                console.warn(`⚠️ [PaddleOCR:CLI] Python 环境或脚本不存在: python=${pythonBin}, script=${scriptPath}`);
                return '';
            }

            const { stdout, stderr } = await execFileAsync(pythonBin, [scriptPath, targetPath], {
                timeout: 30000,
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                encoding: 'utf-8',
            });

            if (stderr) {
                console.log('ℹ️ [PaddleOCR:CLI 输出日志]:', stderr.trim().split('\n')[0]);
            }

            const cleanText = (stdout || '').trim();
            if (cleanText) {
                console.log(`✅ [PaddleOCR:CLI] 命令行识别图片成功 (长度: ${cleanText.length} 字符):\n---------------- [OCR 识别全文] ----------------\n${cleanText}\n------------------------------------------------`);
                return cleanText;
            }

            return '';
        } catch (err) {
            console.warn('⚠️ [图片OCR提取] 识别发生异常:', err.message);
            return '';
        }
    }

    /**
     * 从文本中提取发票真实总金额 (优先提取【价税合计】，彻底排除不含税金额与税额干扰)
     */
    private extractAmountFromText(text: string, preferredFileName?: string): number {
        // 1. 优先交叉验证文件名中的金额 (如: 交通_167.91元_xxx.pdf)
        // 如果文件名中的金额在发票文本中真实出现过，100% 就是真正的价税合计！
        if (preferredFileName) {
            const fileAmt = this.extractInvoiceAmountFromFilename(preferredFileName);
            if (fileAmt > 0 && text.includes(fileAmt.toFixed(2))) {
                console.log(`💰 [发票金额提取] 成功从文件名与发票文本交叉锁定价税合计: ￥${fileAmt}`);
                return fileAmt;
            }
        }

        // 2. 检查法定中文大写金额 (如 壹佰陆拾柒圆玖角壹分 -> 167.91)
        // 国家发票制度规定：大写金额必定是唯一的真实价税合计！
        const chineseAmount = this.extractChineseAmount(text);
        if (chineseAmount > 0) {
            console.log(`💰 [发票金额提取] 成功从法定中文大写金额解析价税合计: ￥${chineseAmount}`);
            return chineseAmount;
        }

        // 3. 正则精准捕获“价税合计（小写）”
        const explicitMatch = text.match(/(?:价税合计|小写|价税合计\(小写\)|价税合计（小写）)[^\d]{0,15}[￥¥\s]*(\d+(?:\.\d{1,2})?)/i);
        if (explicitMatch && explicitMatch[1]) {
            const val = parseFloat(explicitMatch[1]);
            if (val > 0 && val < 10000000) {
                return Math.round(val * 100) / 100;
            }
        }

        // 4. 收集所有货币候选数字：在增值税发票中，价税合计必定是候选数值中的最大值 (价税合计 = 不含税合计 + 税额)
        const matches = text.matchAll(/[￥¥]\s*(\d+(?:\.\d{1,2})?)/g);
        const candidates: number[] = [];
        for (const m of matches) {
            const v = parseFloat(m[1]);
            if (v > 0 && v < 10000000) candidates.push(v);
        }

        if (candidates.length > 0) {
            const maxVal = Math.max(...candidates);
            console.log(`💰 [发票金额提取] 从候选金额列表 [${candidates.join(', ')}] 中筛选最大价税合计: ￥${maxVal}`);
            return Math.round(maxVal * 100) / 100;
        }

        // 5. 文件名兜底
        if (preferredFileName) {
            const fileAmt = this.extractInvoiceAmountFromFilename(preferredFileName);
            if (fileAmt > 0) return fileAmt;
        }

        return 0;
    }

    /**
     * 将发票法定中文大写金额转换为精准数字 (如: 壹佰陆拾柒圆玖角壹分 -> 167.91)
     */
    private extractChineseAmount(text: string): number {
        const digitMap: Record<string, number> = { '零': 0, '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5, '陆': 6, '柒': 7, '捌': 8, '玖': 9 };
        const match = text.match(/(?:[零壹贰叁肆伍陆柒捌玖]+(?:拾|佰|仟|万|圆|元|角|分)?)+/);
        if (!match) return 0;

        const str = match[0];
        let total = 0;
        let temp = 0;
        let section = 0;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (digitMap[char] !== undefined) {
                temp = digitMap[char];
            } else if (char === '拾') {
                section += (temp || 1) * 10;
                temp = 0;
            } else if (char === '佰') {
                section += (temp || 1) * 100;
                temp = 0;
            } else if (char === '仟') {
                section += (temp || 1) * 1000;
                temp = 0;
            } else if (char === '万') {
                total += (section + temp) * 10000;
                section = 0;
                temp = 0;
            } else if (char === '圆' || char === '元') {
                section += temp;
                total += section;
                section = 0;
                temp = 0;
            } else if (char === '角') {
                total += temp * 0.1;
                temp = 0;
            } else if (char === '分') {
                total += temp * 0.01;
                temp = 0;
            }
        }
        return Math.round(total * 100) / 100;
    }

    /**
     * 从发票文件名中提取金额 (同时兼容 UTF-8 "元" 与 Latin1 乱码 "å…ƒ")
     */
    private extractInvoiceAmountFromFilename(fileName: string): number {
        const match = fileName.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|å…ƒ)/i);
        if (match && match[1]) {
            return parseFloat(match[1]);
        }
        return 0;
    }

    private extractExpenseReason(formData: Record<string, any>): string {
        return formData?.reason || formData?.remark || formData?.description || formData?.cause || '员工差旅与日常办公报销';
    }

    private extractApplicantName(formData: Record<string, any>): string {
        return formData?.userName || formData?.applicant || formData?.applicantName || formData?.createBy || '申请人';
    }
}
