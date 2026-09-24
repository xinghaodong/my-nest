import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalInstance } from '../logic-flow/entities/approval-instance.entity';
import { IAgentGraph, AgentRunInput, AgentResumeInput, BaseAuditResult } from './core/base-agent.interface';
import { AGENT_ROLES, normalizeAgentRole } from './core/agent-roles.constant';
import { InvoiceAuditAgentGraph } from './agents/finance/invoice-audit/invoice-audit.graph';
import { BudgetControlAgentGraph } from './agents/finance/budget-control/budget-control.graph';
import { JointReviewAgentGraph } from './agents/finance/joint-review/joint-review.graph';

@Injectable()
export class AgentFlowService {
    private readonly logger = new Logger(AgentFlowService.name);

    /**
     * 智能体策略注册表 (Role -> IAgentGraph)
     */
    private agentRegistry = new Map<string, IAgentGraph>();

    constructor(
        @InjectRepository(ApprovalInstance)
        private instanceRepo: Repository<ApprovalInstance>,
    ) {
        this.registerDefaultAgents();
    }

    /**
     * 注册所有内置业务领域 Agent
     */
    private registerDefaultAgents() {
        // 💰 财务领域 Agent 1: 发票验真与查重初审专员
        const invoiceAuditAgent = new InvoiceAuditAgentGraph(this.instanceRepo);
        this.agentRegistry.set(invoiceAuditAgent.role, invoiceAuditAgent);

        // 💰 财务领域 Agent 2: 部门预算与额度管控专员
        const budgetControlAgent = new BudgetControlAgentGraph();
        this.agentRegistry.set(budgetControlAgent.role, budgetControlAgent);

        // 🤝 财务领域 Agent 3: 合议风控并行审查专员 (LangGraph 原生并行调度发票+预算)
        const jointReviewAgent = new JointReviewAgentGraph(this.instanceRepo);
        this.agentRegistry.set(jointReviewAgent.role, jointReviewAgent);

        this.logger.log(
            `🚀 [AgentFlowService] 智能体微内核就绪，已装载 ${this.agentRegistry.size} 个原子业务 Agent: [${Array.from(this.agentRegistry.keys()).join(', ')}]`,
        );
    }

    /**
     * 动态注册自定义 Agent (高扩展性插件机制)
     */
    public registerAgent(agent: IAgentGraph) {
        this.agentRegistry.set(agent.role, agent);
        this.logger.log(`🔌 [AgentFlowService] 动态挂载新业务 Agent: ${agent.role} (${agent.roleName})`);
    }

    /**
     * 统一单智能体调度执行入口 (按角色分派策略)
     * @param role 智能体角色标识 (如 'finance:invoice_audit' 或 'finance:budget_control')
     * @param input 运行参数上下文
     */
    async executeAgentAudit(role: string, input: AgentRunInput): Promise<BaseAuditResult> {
        const normalizedRole = normalizeAgentRole(role);
        const agent = this.agentRegistry.get(normalizedRole);

        if (!agent) {
            this.logger.warn(`⚠️ 未找到角色为 [${role}] (标准化: ${normalizedRole}) 的智能体，自动降级为财务发票初审 Agent`);
            const fallbackAgent = this.agentRegistry.get(AGENT_ROLES.FINANCE_INVOICE)!;
            return await fallbackAgent.run(input);
        }

        this.logger.log(`🎯 [调度中心] 分派任务给 -> [${agent.roleName}] (实例ID: #${input.instanceId})`);
        return await agent.run(input);
    }

    /**
     * 唤醒并恢复挂起的智能体 (HITL 特批恢复)
     */
    async resumeAgentAudit(role: string, input: AgentResumeInput): Promise<BaseAuditResult> {
        const normalizedRole = normalizeAgentRole(role);
        const agent = this.agentRegistry.get(normalizedRole);

        if (!agent || typeof agent.resume !== 'function') {
            this.logger.warn(`⚠️ 智能体 [${role}] 不支持 resume 恢复，尝试降级为财务发票专员恢复`);
            const fallbackAgent = this.agentRegistry.get(AGENT_ROLES.FINANCE_INVOICE)!;
            if (fallbackAgent.resume) {
                return await fallbackAgent.resume(input);
            }
            throw new Error(`智能体 [${role}] 不支持 resume 恢复操作`);
        }

        this.logger.log(`▶️ [调度中心] 恢复挂起的智能体 -> [${agent.roleName}] (实例ID: #${input.instanceId})`);
        return await agent.resume(input);
    }

    /**
     * 多智能体并发并行调度 (Fork-Join 并行模式)
     * 两个或多个 Agent 同时运行，互不阻塞，完成后聚合产出所有结论
     * @param roles 需要并行执行的智能体角色列表
     * @param input 共享运行输入
     */
    async executeParallelAgents(roles: string[], input: AgentRunInput): Promise<BaseAuditResult[]> {
        this.logger.log(`⚡ [调度中心] 启动多 Agent 并发并行审查: [${roles.join(', ')}]...`);
        const tasks = roles.map(r => this.executeAgentAudit(r, input));
        return await Promise.all(tasks);
    }

    /**
     * 根据角色标识获取其对应的专业中文名称
     */
    public getAgentRoleName(role?: string): string {
        const normalized = normalizeAgentRole(role);
        return this.agentRegistry.get(normalized)?.roleName || '🤖 通用智能体审查员';
    }


    /**
     * 获取当前已注册的所有智能体清单与元数据
     */
    public getRegisteredAgents(): Array<{ role: string; roleName: string }> {
        return Array.from(this.agentRegistry.values()).map(a => ({
            role: a.role,
            roleName: a.roleName,
        }));
    }
}
