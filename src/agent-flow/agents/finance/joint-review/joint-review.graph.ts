import { StateGraph, START, END } from '@langchain/langgraph';
import { JointReviewAnnotation, JointReviewState } from './joint-review.state';
import { IAgentGraph, AgentRunInput, BaseAuditResult, AiRealSpeech } from '../../../core/base-agent.interface';
import { Repository } from 'typeorm';
import { ApprovalInstance } from '../../../../logic-flow/entities/approval-instance.entity';
import { InvoiceAuditAgentGraph } from '../invoice-audit/invoice-audit.graph';
import { BudgetControlAgentGraph } from '../budget-control/budget-control.graph';

/**
 * 🤝 财务领域:合议风控并行审查 Agent (LangGraph 原生并行 fan-out + join)
 *
 * 拓扑结构:
 *   START → prepare → ┬→ invoice_node ──┐
 *                     └→ budget_node  ──┴→ aggregate → END
 *
 *   - prepare 后两条出边 → LangGraph 自动并行执行 invoice_node / budget_node
 *   - 两条入边汇聚到 aggregate → LangGraph barrier 自动等两路都完成才执行
 *   - invoice_node 复用 InvoiceAuditAgentGraph.run(),只写 state.invoiceResult
 *   - budget_node 复用 BudgetControlAgentGraph.run(),只写 state.budgetResult
 *   - aggregate 汇聚两路结论:一票否决 + 木桶短板 + 报告合并
 *
 * 🌟 核心设计:state 字段拆分,两个并行节点写不同 channel,无需自定义 reducer。
 */
export class JointReviewAgentGraph implements IAgentGraph {
    readonly role = 'finance:joint_review';
    readonly roleName = '🤝 财务-合议风控并行审查专员';

    private graph: any;

    // 复用两个现有子 Agent (只 new 实例调 run, 绝不修改其源码)
    private invoiceAgent: InvoiceAuditAgentGraph;
    private budgetAgent: BudgetControlAgentGraph;

    constructor(private instanceRepo?: Repository<ApprovalInstance>) {
        // 发票专员需要 instanceRepo 做跨单据查重;预算专员无参构造
        this.invoiceAgent = new InvoiceAuditAgentGraph(instanceRepo);
        this.budgetAgent = new BudgetControlAgentGraph();
        this.graph = this.buildGraph();
    }

    /**
     * 构建 LangGraph 状态图 (原生并行 fan-out + join)
     */
    public buildGraph() {
        const workflow = new StateGraph(JointReviewAnnotation)
            // Node 1: 数据准备与并行 fan-out 起点
            .addNode('prepare', this.prepareNode.bind(this))
            // Node 2 (并行分支 A): 发票验真与查重初审专员
            .addNode('invoice_node', this.invoiceNode.bind(this))
            // Node 3 (并行分支 B): 部门预算与额度管控专员
            .addNode('budget_node', this.budgetNode.bind(this))
            // Node 4: 合议汇聚节点 (两路 barrier 等齐后执行)
            .addNode('aggregate', this.aggregateNode.bind(this))
            // 🌟 fan-out: prepare 后两条出边 → LangGraph 自动并行调度
            .addEdge(START, 'prepare')
            .addEdge('prepare', 'invoice_node')
            .addEdge('prepare', 'budget_node')
            // 🌟 join: 两条入边汇聚到 aggregate → barrier 自动等齐
            .addEdge('invoice_node', 'aggregate')
            .addEdge('budget_node', 'aggregate')
            .addEdge('aggregate', END);

        return workflow.compile();
    }

    /**
     * 实现 IAgentGraph 的统一运行接口
     */
    public async run(input: AgentRunInput): Promise<BaseAuditResult> {
        console.log(`🚀 [${this.roleName}] 启动并行合议审查 (流程实例: #${input.instanceId})...`);

        const initialState: Partial<JointReviewState> = {
            instanceId: input.instanceId,
            formData: input.formData || {},
            files: input.files || [],
            riskThreshold: input.riskThreshold ?? 80,
            invoiceResult: null,
            budgetResult: null,
            auditResult: null,
            agentRole: this.role,
            agentRoleName: this.roleName,
            currentNodeId: 'ai-agent',
            status: 'running',
            error: null,
        };

        try {
            const finalState = await this.graph.invoke(initialState);
            console.log(`✅ [${this.roleName}] 合议审查结束 (最终得分: ${finalState.auditResult?.complianceScore}, 通过: ${finalState.auditResult?.pass})`);
            return finalState.auditResult;
        } catch (error) {
            console.error(`❌ [${this.roleName}] 并行合议执行异常:`, error);
            throw error;
        }
    }

    /**
     * Node 1: prepare - 共享上下文准备与并行 fan-out 起点
     */
    private async prepareNode(state: JointReviewState): Promise<Partial<JointReviewState>> {
        console.log(`🤝 [Node 1: prepare] 启动并行 fan-out: 发票验真 + 预算管控 (实例 #${state.instanceId})`);
        console.log(`🤝 [Node 1: prepare] 申报金额: ￥${state.formData?.amount ?? state.formData?.totalAmount ?? '未填'}, 部门: ${state.formData?.department ?? state.formData?.deptName ?? '未填'}, 附件数: ${state.files?.length || 0}`);
        return { status: 'running' };
    }

    /**
     * Node 2 (并行分支 A): 复用发票验真初审 Agent
     * 🌟 只写 invoiceResult, 不碰其他可写字段, 避免与 budget_node 的写冲突
     */
    private async invoiceNode(state: JointReviewState): Promise<Partial<JointReviewState>> {
        console.log(`🤝 [并行分支 A: invoice_node] 发起发票验真与查重初审...`);
        const input: AgentRunInput = {
            instanceId: state.instanceId,
            formData: state.formData,
            files: state.files,
            riskThreshold: state.riskThreshold,
        };
        const result = await this.invoiceAgent.run(input);
        console.log(`🤝 [并行分支 A: invoice_node] 完成 -> pass=${result.pass}, score=${result.complianceScore}`);
        return { invoiceResult: result };
    }

    /**
     * Node 3 (并行分支 B): 复用部门预算管控 Agent
     * 🌟 只写 budgetResult, 不碰其他可写字段, 避免与 invoice_node 的写冲突
     */
    private async budgetNode(state: JointReviewState): Promise<Partial<JointReviewState>> {
        console.log(`🤝 [并行分支 B: budget_node] 发起部门预算额度管控审查...`);
        const input: AgentRunInput = {
            instanceId: state.instanceId,
            formData: state.formData,
            files: state.files,
            riskThreshold: state.riskThreshold,
        };
        const result = await this.budgetAgent.run(input);
        console.log(`🤝 [并行分支 B: budget_node] 完成 -> pass=${result.pass}, score=${result.complianceScore}`);
        return { budgetResult: result };
    }
    /**
     * Node 4: aggregate - 合议汇聚 (核心)
     * 两路 barrier 等齐后执行, 合成最终合议版 BaseAuditResult
     *   - ai_pass: 一票否决 (任一专员不通过即整体不通过)
     *   - complianceScore: 木桶短板 (取两路最低分)
     *   - aiRealSpeech: 两路原话聚合 (不通过优先标注)
     */
    private async aggregateNode(state: JointReviewState): Promise<Partial<JointReviewState>> {
        console.log(`⚖️ [Node 4: aggregate] 两路并行审查均已完成, 开始合议汇聚...`);

        const inv = state.invoiceResult;
        const bud = state.budgetResult;

        // 防御: 某一路意外为空时降级为不通过 (理论上 invoke 成功进到这里两路都非空)
        const invPass = inv ? inv.pass : false;
        const budPass = bud ? bud.pass : false;
        const invScore = inv ? Number(inv.complianceScore) || 0 : 0;
        const budScore = bud ? Number(bud.complianceScore) || 0 : 0;

        // 1. 一票否决: 任一专员不通过即整体不通过
        const pass = invPass && budPass;

        // 2. 木桶短板: 取两路最低分作为整单综合风控分
        const complianceScore = Math.min(invScore, budScore);
        const riskScore = complianceScore;

        // 3. summary 拼接: 不通过的一路显式标注, 让审批人一眼定位问题源
        const invTag = invPass ? '' : '【发票分支不通过】';
        const budTag = budPass ? '' : '【预算分支不通过】';
        const invSummary = inv?.summary || '发票分支无结论';
        const budSummary = bud?.summary || '预算分支无结论';
        const summary = `🤝 合议并行审查结论:${invTag}${invSummary}；${budTag}${budSummary}`;

        // 4. 异常项合并
        const anomalyList = [
            ...(inv?.anomalyList || []),
            ...(bud?.anomalyList || []),
        ];

        // 5. 处置建议合并去重
        const suggestions = [...new Set([
            ...(inv?.suggestions || []),
            ...(bud?.suggestions || []),
        ])];

        // 6. AI 真实原话聚合 (两路大模型原话均独立留存, 供审计回溯)
        const invSpeech = inv?.aiRealSpeech;
        const budSpeech = bud?.aiRealSpeech;
        const aiRealSpeech: AiRealSpeech = {
            summary: `${invSpeech?.summary || invSummary}；${budSpeech?.summary || budSummary}`,
            reasonCheck: [invSpeech?.reasonCheck, budSpeech?.reasonCheck].filter(Boolean).join(' | '),
            suggestions,
            rawOutput: JSON.stringify({
                invoice: invSpeech?.rawOutput || inv?.rawModelResponse || '',
                budget: budSpeech?.rawOutput || bud?.rawModelResponse || '',
            }, null, 2),
            modelName: `${invSpeech?.modelName || 'invoice'} + ${budSpeech?.modelName || 'budget'}`,
            provider: 'parallel_joint_review',
            executedAt: new Date().toISOString(),
        };

        // 7. details: 保留两路完整结果 + 关键回填字段
        //    🌟 必须含顶层 invoices / totalInvoiceAmount,
        //    否则 logic-flow.service.ts processTargetNode L571/L605 取不到, formData.amount 与 formData.invoices 不注入
        const details = {
            invoice: inv,                    // 发票专员完整结果对象
            budget: bud,                     // 预算专员完整结果对象
            totalInvoiceAmount: inv?.details?.totalInvoiceAmount,  // 供 processTargetNode 回填 amount/totalAmount
            invoices: inv?.details?.invoices,                        // 供 processTargetNode 注入 formData.invoices
            declaredAmount: bud?.details?.declaredAmount,            // 冗余备用
            executionMode: 'parallel_langgraph',
            agentRoles: ['finance:invoice_audit', 'finance:budget_control'],
            parallelBranchScores: { invoice: invScore, budget: budScore },
            isSuspended: Boolean(inv?.isSuspended),
            specialApproval: inv?.specialApproval,
        };

        const isInvSuspended = Boolean(inv?.isSuspended);

        const auditResult: BaseAuditResult = {
            pass: isInvSuspended ? false : pass,
            complianceScore,
            summary: isInvSuspended ? `⚠️ [合议审查挂起] 预算审查合规就绪；${inv?.summary || '发票开票日期超期，等待人工特批'}` : summary,
            anomalyList,
            details,
            suggestions,
            rawModelResponse: aiRealSpeech.rawOutput,
            aiRealSpeech,
            isSuspended: isInvSuspended,
            suspendInfo: inv?.suspendInfo,
            specialApproval: inv?.specialApproval,
        };

        console.log(`🎉 [Node 4: aggregate] 合议汇聚完成 -> 挂起状态: ${isInvSuspended}, 最终通过: ${auditResult.pass}, 综合得分: ${complianceScore} (发票${invScore}/预算${budScore})`);
        return { auditResult, status: 'completed' };
    }

    /**
     * 唤醒并恢复并行合议审查 (HITL 人工特批恢复)
     */
    public async resume(input: any): Promise<BaseAuditResult> {
        console.log(`▶️ [${this.roleName}] 收到合议审查特批恢复唤醒 (实例 #${input.instanceId}), 决定: ${input.approved ? '同意放行' : '予以驳回'}`);

        const formData = input.formData || input.extraData?.formData || {};
        const files = input.files || input.extraData?.files || [];

        // 1. 唤醒发票专员
        const resumedInvoice = await this.invoiceAgent.resume(input);

        // 2. 获取或复算预算专员结果
        let budgetResult = input.extraData?.savedBudgetResult || formData.aiAuditReports?.['finance:budget_control'];
        if (!budgetResult && (formData.amount || formData.totalAmount)) {
            budgetResult = await this.budgetAgent.run({
                instanceId: input.instanceId,
                formData,
                files,
            });
        }

        const invScore = Number(resumedInvoice?.complianceScore ?? 0);
        const budScore = Number(budgetResult?.complianceScore ?? invScore);
        const pass = Boolean(resumedInvoice?.pass && (budgetResult ? budgetResult.pass : true));
        const complianceScore = Math.min(invScore, budScore);

        const invSummary = resumedInvoice?.summary || (input.approved ? '发票特批放行通过' : '发票特批驳回');
        const budSummary = budgetResult?.summary || '预算审核在额度内合规';
        const summary = `🤝 合议并行审查特批完成: ${invSummary}；${budSummary}`;

        return {
            pass,
            complianceScore,
            summary,
            anomalyList: [...(resumedInvoice?.anomalyList || []), ...(budgetResult?.anomalyList || [])],
            details: {
                invoice: resumedInvoice,
                budget: budgetResult,
                totalInvoiceAmount: resumedInvoice?.details?.totalInvoiceAmount,
                invoices: resumedInvoice?.details?.invoices || formData.invoices,
                specialApproval: resumedInvoice?.specialApproval,
                executionMode: 'parallel_langgraph_resumed',
            },
            suggestions: [...new Set([...(resumedInvoice?.suggestions || []), ...(budgetResult?.suggestions || [])])],
            specialApproval: resumedInvoice?.specialApproval,
            rawModelResponse: resumedInvoice?.rawModelResponse,
        };
    }
}
