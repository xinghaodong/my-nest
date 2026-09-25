import { StateGraph, START, END } from '@langchain/langgraph';
import { BudgetControlAnnotation, BudgetControlState } from './budget-control.state';
import { IAgentGraph, AgentRunInput, BaseAuditResult } from '../../../core/base-agent.interface';
import { AGENT_ROLES } from '../../../core/agent-roles.constant';
import { useAgentLlm } from '../../../core/use-agent-llm';

/**
 * 💰 财务领域第二个 Agent：部门预算与额度管控专员 (LangGraph 状态图 + useAgentLlm 统一驱动)
 */
export class BudgetControlAgentGraph implements IAgentGraph {
    readonly role = AGENT_ROLES.FINANCE_BUDGET;
    readonly roleName = '💰 财务-部门预算与额度管控专员';

    private graph: any;
    // 🌟 统一大模型驱动 Hook (支持智谱 GLM-4 与本地 Ollama 自动切换与容错)
    private llm = useAgentLlm('财务-部门预算专员');

    constructor() {
        this.graph = this.buildGraph();
    }

    public buildGraph() {
        const workflow = new StateGraph(BudgetControlAnnotation)
            .addNode('prepare_budget', this.prepareBudgetNode.bind(this))
            .addNode('llm_audit', this.llmAuditNode.bind(this))
            .addNode('evaluate_result', this.evaluateResultNode.bind(this))
            .addEdge(START, 'prepare_budget')
            .addEdge('prepare_budget', 'llm_audit')
            .addEdge('llm_audit', 'evaluate_result')
            .addEdge('evaluate_result', END);

        return workflow.compile();
    }

    public async run(input: AgentRunInput): Promise<BaseAuditResult> {
        console.log(`🚀 [${this.roleName}] 启动执行 (流程实例: #${input.instanceId})...`);

        const department = input.formData?.department || input.formData?.deptName || '研发中心';
        const declaredAmount = Number(input.context?.declaredAmount ?? 0);

        // 模拟各业务部门的季度预算与已使用额度字典
        const deptBudgets: Record<string, { quarter: number; used: number }> = {
            '研发中心': { quarter: 50000, used: 49910 },  // 剩余 18,000 元 (充裕，正常通过)
            '技术部': { quarter: 50000, used: 32000 },    // 剩余 18,000 元
            '市场部': { quarter: 3000, used: 2880 },      // 剩余   120 元 (报销 > 120 即超标拦截)
            '市场拓展部': { quarter: 3000, used: 2880 },
            '销售部': { quarter: 5000, used: 4850 },      // 剩余 150 元 (报销 > 150 超标拦截)
            '运营部': { quarter: 2000, used: 1900 },      // 剩余 100 元 (超标拦截)
        };

        const currentDeptConfig = deptBudgets[department] || { quarter: 50000, used: 32000 };

        const initialState: Partial<BudgetControlState> = {
            instanceId: input.instanceId,
            formData: input.formData || {},
            files: input.files || [],
            agentRole: this.role,
            agentRoleName: this.roleName,
            riskThreshold: input.riskThreshold ?? 80,
            department,
            declaredAmount,
            quarterBudget: currentDeptConfig.quarter,
            usedBudget: currentDeptConfig.used,
            isOverBudget: false,
            currentNodeId: 'ai-agent',
            status: 'running',
            auditResult: null,
            error: null,
        };

        const finalState = await this.graph.invoke(initialState);
        return finalState.auditResult;
    }

    /**
     * Node 1: prepare_budget - 准备部门预算台账与报销金额特征
     */
    private async prepareBudgetNode(state: BudgetControlState): Promise<Partial<BudgetControlState>> {
        const declaredAmount = state.declaredAmount || 0;
        const quarterBudget = state.quarterBudget || 50000;
        const usedBudget = state.usedBudget || 32000;
        const remainingBudget = Number((quarterBudget - usedBudget).toFixed(2));
        const isOver = declaredAmount > remainingBudget;

        console.log(`📊 [Node 1: prepare_budget] 提取部门预算数据: 部门 [${state.department}], 本季总预算 ￥${quarterBudget}, 已用 ￥${usedBudget}, 剩余 ￥${remainingBudget}, 申请 ￥${declaredAmount}`);

        return {
            isOverBudget: isOver,
        };
    }

    /**
     * Node 2: llm_audit - 调用真实大模型进行综合预算合规性分析与审计裁决
     */
    private async llmAuditNode(state: BudgetControlState): Promise<Partial<BudgetControlState>> {
        console.log(`🤖 [Node 2: llm_audit] 调用财务预算内控大模型进行综合裁决...`);

        const department = state.department || '研发中心';
        const declaredAmount = state.declaredAmount || 0;
        const quarterBudget = state.quarterBudget || 50000;
        const usedBudget = state.usedBudget || 32000;
        const remainingBudget = Number((quarterBudget - usedBudget).toFixed(2));
        const afterExpenseBudget = Number((remainingBudget - declaredAmount).toFixed(2));
        const usageRatio = remainingBudget > 0 ? ((declaredAmount / remainingBudget) * 100).toFixed(2) : '100.00';
        const isOver = declaredAmount > remainingBudget;

        const systemPrompt = `你是一名资深的企业财务预算管控专员兼内控总监。
你的职责是对业务部门提交的费用报销申请进行部门可用预算额度核验、额度占用分析与内控合规裁决。
请基于申请部门的季度预算台账和本次申报金额进行综合评判。

【输出规范】
你必须直接输出纯 JSON 字符串，绝不要使用 Markdown 代码块（如不要输出 \`\`\`json ），不要输出任何开场白或解释。
JSON 格式规范如下：
{
  "complianceScore": <0-100的整数，超预算时必须低于50>,
  "pass": <true或false，超预算时必须为false>,
  "summary": "一句话审核结论（必须包含部门名称、剩余额度、本次金额是否在预算范围内、准予或不准予列支）",
  "reasonCheck": "详细预算占用分析与内控意见（如已占用百分比、支出后余量）",
  "anomalyList": [
    {
      "type": "budget_exceeded",
      "severity": "high",
      "description": "具体超额违规事实描述（含具体超支金额）",
      "suggestion": "处置建议（如需部门总监追加特批）"
    }
  ],
  "isOverBudget": false,
  "riskLevel": "LOW",
  "suggestions": ["给审批人或申请人的建议1", "建议2"]
}`;

        const userPrompt = `请对以下部门预算申请进行严密合规审核：

【部门预算台账数据】
- 申请部门: ${department}
- 本季度总预算: ￥${quarterBudget} 元
- 季度已发生支出: ￥${usedBudget} 元
- 季度当前剩余可用额度: ￥${remainingBudget} 元

【本次报销申请数据】
- 本次报销申报金额: ￥${declaredAmount} 元
- 支出后部门剩余额度: ￥${afterExpenseBudget} 元
- 本次支出占剩余预算比率: ${usageRatio}%
- 报销事由: ${state.formData?.reason || state.formData?.remark || '业务日常报销'}

【内控标准】
1. 若 申报金额 > 剩余预算 (已超标)，必须判定 pass: false，合规分 50 以下，riskLevel 为 "HIGH"，在 anomalyList 中明确指出超额金额；
2. 若 支出占用剩余预算 > 80%，判定 pass: true，合规分 80，riskLevel 为 "MEDIUM"，提出预警建议；
3. 若 预算充足，判定 pass: true，合规分 95 以上，riskLevel 为 "LOW"，准予支出。

请给出你的裁决 JSON：`;

        let rawModelResponse = '';
        let auditResult: BaseAuditResult;

        try {
            // 🚀 调用 useAgentLlm 统一驱动：支持智谱 GLM-4 / 本地 Ollama 自动路由与降级
            rawModelResponse = await this.llm.callModelApi(systemPrompt, userPrompt);
            const parsed = this.llm.parseModelJson(rawModelResponse);

            let pass = typeof parsed.pass === 'boolean' ? parsed.pass : !isOver;
            let complianceScore = typeof parsed.complianceScore === 'number' ? parsed.complianceScore : (pass ? 95 : 50);
            const summary = parsed.summary || (pass ? `【部门预算审核通过】[${department}] 预算额度充裕，准予列支。` : `【部门预算超额拦截】[${department}] 申报金额已超出可用预算！`);
            const reasonCheck = parsed.reasonCheck || `申报金额 ￥${declaredAmount}，本季剩余 ￥${remainingBudget}。`;
            let anomalyList = Array.isArray(parsed.anomalyList) ? parsed.anomalyList : [];

            // 🚨 核心安全网：超预算红线只做底线门禁拦截 (Pass/Score)，绝不暴力篡改大模型生成的 summary 与 reasonCheck
            if (isOver) {
                pass = false;
                complianceScore = Math.min(complianceScore, 40);
                if (!anomalyList.some(a => a.type === 'budget_exceeded' || a.description?.includes('超'))) {
                    anomalyList.unshift({
                        type: 'budget_exceeded',
                        severity: 'high',
                        description: `报销申报金额 (￥${declaredAmount}) 超出部门季度剩余可用预算 (￥${remainingBudget})，超额 ￥${(declaredAmount - remainingBudget).toFixed(2)}`,
                        suggestion: '需提交部门总监进行追加预算特批',
                    });
                }
            }

            const realSpeech = {
                summary,
                reasonCheck,
                suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : ['按财务制度常规流转'],
                rawOutput: rawModelResponse,
                modelName: process.env.AI_ZP_DEFAULT_MODEL || process.env.AI_BD_DEFAULT_MODEL || 'gemma3:4b',
                provider: process.env.MODEL_PROVIDER || 'zhipu',
                executedAt: new Date().toISOString(),
            };

            auditResult = {
                pass,
                complianceScore,
                summary,
                checkSummary: '部门预算及可用额度核验通过，报销金额在部门可支配预算配额内。',
                anomalyList,
                details: {
                    department,
                    declaredAmount,
                    quarterBudget,
                    usedBudget,
                    remainingBudget,
                    afterExpenseBudget,
                    isOverBudget: isOver,
                    reasonCheck,
                    riskLevel: isOver ? 'HIGH' : (parsed.riskLevel || 'LOW'),
                },
                suggestions: realSpeech.suggestions,
                aiRealSpeech: realSpeech,
                rawModelResponse,
            };

            console.log(`🎉 [Node 2: llm_audit] 大模型预算裁决成功！得分: ${complianceScore}, 判定通过: ${pass}`);
        } catch (llmErr) {
            console.warn(`⚠️ [Node 2: llm_audit] 大模型调用或解析异常 (${llmErr.message})，启用规则引擎安全保底:`, llmErr);

            const score = isOver ? 50 : 95;
            const pass = score >= (state.riskThreshold || 80);
            const summary = pass
                ? `【部门预算审核通过】[${department}] 本季度剩余可用预算 ￥${remainingBudget}，本次报销金额 ￥${declaredAmount} 在部门预算额度内，准予支出。`
                : `【部门预算超额拦截】[${department}] 本季度剩余预算仅剩 ￥${remainingBudget}，本次申报金额 ￥${declaredAmount} 已超出部门季度可用上限！`;

            const realSpeech = {
                summary,
                reasonCheck: `申报金额 ￥${declaredAmount}，部门可用预算 ￥${remainingBudget}。`,
                suggestions: isOver ? ['需追加部门总监特批'] : ['预算充裕，正常审批'],
                rawOutput: summary,
                modelName: 'fallback-rules',
                provider: 'local-rules',
                executedAt: new Date().toISOString(),
            };

            auditResult = {
                pass,
                complianceScore: score,
                summary,
                checkSummary: '部门预算及可用额度核验通过，报销金额在部门可支配预算配额内。',
                anomalyList: isOver ? [{ type: 'budget_exceeded', severity: 'high', description: '报销超额' }] : [],
                details: {
                    department,
                    declaredAmount,
                    quarterBudget,
                    usedBudget,
                    remainingBudget,
                    afterExpenseBudget,
                    isOverBudget: isOver,
                },
                suggestions: realSpeech.suggestions,
                aiRealSpeech: realSpeech,
            };
        }

        return {
            auditResult,
            isOverBudget: auditResult.details?.isOverBudget ?? isOver,
        };
    }

    /**
     * Node 3: evaluate_result - 结果终评
     */
    private async evaluateResultNode(state: BudgetControlState): Promise<Partial<BudgetControlState>> {
        console.log(`⚖️ [Node 3: evaluate_result] 预算管控专员审查完毕，结论: ${state.auditResult?.summary}`);
        return { status: 'completed' };
    }
}
