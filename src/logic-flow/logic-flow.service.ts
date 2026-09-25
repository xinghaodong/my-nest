// LogicFlow type 说明 rect 就是必须有审批人， 条件 diamond

import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { CreateLogicFlowDto } from './dto/create-logic-flow.dto';
import { UpdateLogicFlowDto } from './dto/update-logic-flow.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { LogicFlow } from './entities/logic-flow.entity';
import { Repository } from 'typeorm';
import { FormDesign } from '../form-design/entities/form-design.entity';
import { ApprovalInstance } from './entities/approval-instance.entity';
import { InternalusersService } from '../internalusers/internalusers.service';
import { AgentFlowService } from '../agent-flow/agent-flow.service';
/**
 * 流程流转执行结果（严格类型定义，杜绝模糊 null 歧义与文本猜测）
 */
export interface FlowStepResult {
    isCompleted: boolean; // 是否到达结束事件终态
    status: '1' | '2' | '3'; // 1=待人工审批, 2=审批通过, 3=审批驳回
    currentNodeId: string | null; // 未完结时的停驻节点ID
    currentApproverId: number | null; // 未完结时的当前审批人ID
    finishReason?: string; // 终态结单原因或流转附言
}

@Injectable()
export class LogicFlowService {
    constructor(
        @InjectRepository(LogicFlow)
        private logicFlowRepository: Repository<LogicFlow>,
        @InjectRepository(FormDesign)
        private formRepo: Repository<FormDesign>,
        @InjectRepository(ApprovalInstance)
        private instanceRepo: Repository<ApprovalInstance>,
        private readonly internalusersService: InternalusersService,
        private readonly agentFlowService: AgentFlowService,
    ) {}

    async create(createLogicFlowDto: CreateLogicFlowDto): Promise<LogicFlow> {
        // 🌟 1. 严格一对一校验：一个表单只能绑定一个流程模板，禁止重复绑定
        const currentWorkflowId = (createLogicFlowDto as any).id;
        await this.validateFormBindingUniqueness(createLogicFlowDto.formId, currentWorkflowId);

        const graphData = createLogicFlowDto.graphData || {};
        const nodes = graphData.nodes || [];
        const validationErrors = this.validateWorkflow(graphData);
        if (validationErrors.length > 0) {
            console.error('❌ 流程图验证失败：', validationErrors);
            throw new BadRequestException('流程图设计不完整，请联系管理员：' + validationErrors.join('; '));
        }

        const getNodeText = (node: any) => (typeof node?.text === 'string' ? node.text : node?.text?.value || '');

        // 智能查找开始节点
        const startNodeIndex = nodes.findIndex(n => n.type === 'circle' && getNodeText(n) === '开始');
        if (startNodeIndex === -1) {
            throw new BadRequestException('流程图错误，请检查开始节点（必须包含一个文字为“开始”的圆形节点）');
        }

        // 智能查找结束节点
        const endNodeIndex = nodes.findIndex(n => n.type === 'circle' && getNodeText(n) === '结束');
        if (endNodeIndex === -1) {
            throw new BadRequestException('流程图错误，请检查结束节点（必须包含一个文字为“结束”的圆形节点）');
        }

        // 节点人员配置校验：rect 必须有审批人，ai-agent 必须有人机协同特批人 (HITL)
        for (let index = 0; index < nodes.length; index++) {
            const element = nodes[index];
            const nodeTitle = getNodeText(element) || element.id;
            if (element.type === 'rect' && !element.properties?.assignee) {
                throw new BadRequestException(`流程图错误，审批节点 [${nodeTitle}] 未配置审批人`);
            }
            if (element.type === 'ai-agent' && !element.properties?.specialApproverId) {
                throw new BadRequestException(`流程图错误，AI智能审查节点 [${nodeTitle}] 必须配置人机协同特批人(HITL)`);
            }
        }

        // 自动规范化节点数组顺序：将“开始”置于首位，将“结束”置于末尾，彻底消除拖拽顺序差异
        const startNode = nodes.splice(startNodeIndex, 1)[0];
        const newEndIndex = nodes.findIndex(n => n.type === 'circle' && getNodeText(n) === '结束');
        const endNode = nodes.splice(newEndIndex, 1)[0];
        nodes.unshift(startNode);
        nodes.push(endNode);

        const logicFlow = this.logicFlowRepository.create(createLogicFlowDto);
        return await this.logicFlowRepository.save(logicFlow);
    }

    async findAll(page?: number, pageSize: number = 10): Promise<{ data: LogicFlow[]; total: number }> {
        const [data, total] = await this.logicFlowRepository.findAndCount({
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return { data: data, total };
    }

    async findOne(id: number): Promise<LogicFlow> {
        return await this.logicFlowRepository.findOneBy({ id: id });
    }

    async update(id: number, updateLogicFlowDto: UpdateLogicFlowDto) {
        console.log(id, 'id');
        // 🌟 1. 严格一对一校验：一个表单只能绑定一个流程模板，禁止重复绑定
        await this.validateFormBindingUniqueness(updateLogicFlowDto.formId, id);

        const existingData = await this.findOne(id);
        if (!existingData) {
            throw new HttpException('未找到流程', 404);
        }
        // 合并有效字段到原有数据
        const updatedData = Object.assign(existingData, updateLogicFlowDto);
        // 保存更新
        const result = await this.logicFlowRepository.save(updatedData);
        return result;
    }

    /**
     * 表单与流程模板的绑定校验
     * 🌟 设计变更：已放开"严格一对一"约束，允许一个表单绑定多个流程模板
     *   （便于同一表单对比不同流程设计，如串行多 Agent vs 并行合议 Agent）。
     *   发起审批时由前端显式选择 workflowId 决定走哪条流程；未显式传时后端默认取最新。
     * @param formId 关联表单 ID
     * @param currentWorkflowId 当前流程 ID (编辑更新时传入，保留参数兼容旧调用)
     */
    private async validateFormBindingUniqueness(formId?: number, currentWorkflowId?: number) {
        // 放开一对一约束：同一表单允许多流程绑定，不再拦截
        return;
    }

    /**
     * 按表单 ID 查询其绑定的所有流程模板（轻量列表，供前端发起审批时选择）
     */
    async findByFormId(formId: number): Promise<Partial<LogicFlow>[]> {
        if (!formId) return [];
        return await this.logicFlowRepository.find({
            where: { formId: Number(formId) },
            select: ['id', 'name', 'status', 'formId', 'updated_at'],
            order: { updated_at: 'DESC' },
        });
    }

    async remove(id: number) {
        const result = await this.logicFlowRepository.delete(id);
        if (result.affected === 0) {
            throw new HttpException('没找到流程', 404);
        }
    }
    // 历史审批记录
    async getApprovalHistory(id: number) {
        const instance = await this.instanceRepo.findOne({
            where: { id },
            relations: ['form', 'workflow'],
        });
        if (!instance) throw new BadRequestException('流程实例不存在');
        console.log(instance);
        const graphData = instance.workflow.graphData;
        const nodes = graphData.nodes || [];
        const edges = graphData.edges || [];

        // 1. 提取可能已经完成的 AI 审计数据，合并入 formData 进行执行路径计算
        const evalFormData = { ...instance.formData };
        const aiHistory = instance.approvalHistory?.find(h => h.type === 'ai-agent' || h.auditResult);
        if (aiHistory?.auditResult) {
            evalFormData.complianceScore = aiHistory.auditResult.complianceScore;
            evalFormData.ai_pass = aiHistory.auditResult.pass;
        }

        // 按实例的 formData 计算出“实际执行路径”，包含开始、diamond、rect、结束（按顺序）
        const pathNodes = this.buildExecutionPath(graphData, evalFormData);

        // 2. 只保留我们需要显示的节点（包含 ai-agent 智能体节点，排除 diamond 条件节点）
        let steps = await Promise.all(
            pathNodes
                .filter(node => node.type === 'rect' || node.type === 'ai-agent' || node.text?.value === '开始' || node.text?.value === '结束')
                .map(async node => {
                    if (node.type === 'ai-agent') {
                        const agentRole = node.properties?.agentRole || 'finance:invoice_audit';
                        const agentRoleName = node.properties?.agentRoleName || this.agentFlowService.getAgentRoleName(agentRole);
                        const agentReport = instance.formData?.aiAuditReports?.[agentRole];

                        // 查找该节点在 approvalHistory 中的 AI 执行历史与特批历史
                        const aiHistory = [...(instance.approvalHistory || [])].reverse().find(h => h.nodeId === node.id && h.type === 'ai-agent');
                        const specialHistory = [...(instance.approvalHistory || [])].reverse().find(h => h.nodeId === node.id && h.type === 'special-approval');

                        // 权威报告优先：formData.aiAuditReports 是最全面持久化的报告
                        const auditResult = agentReport?.auditResult || aiHistory?.auditResult || (agentReport?.score !== undefined ? agentReport : null);
                        const specialApproval = agentReport?.specialApproval || specialHistory?.specialApproval || (specialHistory ? {
                            approved: specialHistory.status === '2',
                            comment: specialHistory.comment,
                            approvedAt: specialHistory.approvedAt,
                            approverName: specialHistory.userName,
                        } : null);



                        const isSuspended = Boolean(
                            (aiHistory?.isSuspended || instance.formData?._isSuspended) &&
                            instance.currentNodeId === node.id &&
                            !specialApproval
                        );

                        let nodeStatus = '';
                        if (specialApproval) {
                            nodeStatus = specialApproval.approved ? '2' : '3';
                        } else if (aiHistory) {
                            nodeStatus = aiHistory.status;
                        } else if (node.id === instance.currentNodeId) {
                            nodeStatus = instance.status === '0' ? '0' : '1';
                        }

                        // 🌟 核心增强：关联查询人机协同特批人 (HITL) 姓名
                        let specialApproverName = node.properties?.specialApproverName || null;
                        const specialApproverId = Number(node.properties?.specialApproverId);
                        if (specialApproverId && !specialApproverName) {
                            const approverUser = await this.internalusersService.findUserSimple(specialApproverId);
                            if (approverUser) {
                                specialApproverName = approverUser.name || approverUser.username;
                            }
                        }

                        return {
                            nodeId: node.id,
                            title: node.text?.value || 'AI智能初审',
                            type: 'ai-agent',
                            assignee: node.properties?.assignee,
                            properties: {
                                ...(node.properties || {}),
                                specialApproverId: specialApproverId || undefined,
                                specialApproverName: specialApproverName || undefined,
                            },
                            specialApproverId: specialApproverId || undefined,
                            specialApproverName: specialApproverName || undefined,
                            status: nodeStatus,
                            userName: agentRoleName, // 必须是智能体角色名，不能被特批人姓名覆盖
                            approvedAt: this.formatDateString(specialApproval?.approvedAt || aiHistory?.approvedAt),
                            comment: specialApproval ? specialApproval.comment : (agentReport?.summary || aiHistory?.comment || auditResult?.summary || null),
                            auditResult: auditResult,
                            specialApproval: specialApproval ? {
                                ...specialApproval,
                                approvedAt: this.formatDateString(specialApproval.approvedAt),
                            } : null,
                            isSuspended: isSuspended,
                        };
                    }

                    // 普通节点 (rect, circle)
                    const history = [...(instance.approvalHistory || [])].reverse().find(h => h.nodeId === node.id || (node.text?.value === '开始' && h.nodeId === 'start') || (node.text?.value === '结束' && h.nodeId === 'end'));
                    let assigneeName = history?.userName || node.properties?.assigneeName || null;
                    if (!assigneeName && node.properties?.assignee) {
                        const user = await this.internalusersService.findUserSimple(node.properties.assignee);
                        if (user) {
                            assigneeName = user.name || user.username;
                        }
                    }

                    return {
                        nodeId: node.id,
                        title: node.text?.value || '未知节点',
                        type: node.type,
                        assignee: node.properties?.assignee,
                        properties: {
                            ...(node.properties || {}),
                            assigneeName: assigneeName || undefined,
                        },
                        status: history ? history.status : node.id === instance.currentNodeId ? (instance.status === '0' ? '0' : '1') : '',
                        userName: assigneeName,
                        approvedAt: this.formatDateString(history ? history.approvedAt : null),
                        comment: history ? history.comment : null,
                        auditResult: history?.auditResult || null,
                        isSuspended: false,
                    };
                }),
        );
        // 结束节点状态校准：直接与流程实例终态 instance.status 保持一致
        if (steps[steps.length - 1]?.type === 'circle' && steps[steps.length - 1]?.title == '结束') {
            if (instance.status === '2') {
                steps[steps.length - 1].status = '2';
            } else if (instance.status === '3') {
                steps[steps.length - 1].status = '3';
            }
        }

        const currentNode = nodes.find(n => n.id === instance.currentNodeId);

        // 🌟 关联查询当前停驻节点的当前审批人/特批人姓名
        let currentApproverName: string | null = null;
        if (instance.currentApproverId) {
            const approverUser = await this.internalusersService.findUserSimple(instance.currentApproverId);
            if (approverUser) {
                currentApproverName = approverUser.name || approverUser.username;
            }
        }

        return {
            instanceId: instance.id,
            title: instance.title,
            status: instance.status,
            currentNodeId: instance.currentNodeId,
            currentNodeType: currentNode?.type || null,
            currentApproverId: instance.currentApproverId,
            currentApproverName,
            isSuspended: Boolean(instance.formData?._isSuspended && instance.currentNodeId),
            formData: instance.formData,
            steps,
            edges,
        };
    }

    /**
     * 按 formData 从“开始”节点向下遍历出实际执行路径（包含节点对象，按顺序）
     * - 遇到 diamond (排他网关)：使用 resolveConditionBranchEdge 多条件仲裁
     * - 遇到 rect / ai-agent / circle：取唯一出边
     * - 防止死循环（visited 检测 + safety 上限，均为严格抛异常，绝不静默丢失）
     */
    private buildExecutionPath(graphData: any, formData: Record<string, any>): any[] {
        const nodes = graphData.nodes || [];
        const edges = graphData.edges || [];
        const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));

        const startNode = nodes.find((n: any) => n.type === 'circle' && n.text?.value === '开始');
        if (!startNode) throw new BadRequestException('流程起始节点缺失');

        const path: any[] = [];
        let currentNodeId: string | null = startNode.id;
        const visited = new Set<string>();
        let safety = 0;

        while (currentNodeId) {
            safety++;
            if (safety > 200) {
                throw new BadRequestException('流程执行超过最大节点数 (200)，可能存在循环引用或流程设计异常');
            }
            if (visited.has(currentNodeId)) {
                throw new BadRequestException(`流程存在循环引用，节点：${currentNodeId}`);
            }
            visited.add(currentNodeId);

            const currentNode = nodeMap.get(currentNodeId) as any;
            if (!currentNode) {
                throw new BadRequestException(`流程节点不存在：${currentNodeId}`);
            }
            path.push(currentNode);

            // 如果是结束节点，正常结束
            if (currentNode.type === 'circle' && currentNode.text?.value === '结束') {
                break;
            }

            // 找出出边
            const outgoing = edges.filter((e: any) => e.sourceNodeId === currentNodeId);
            if (!outgoing || outgoing.length === 0) {
                throw new BadRequestException(`节点【${currentNode.text?.value || currentNode.id}】没有连接后续节点`);
            }

            if (currentNode.type === 'diamond') {
                // 🌟 工业级排他网关：使用统一多条件仲裁器
                const branchEdge = this.resolveConditionBranchEdge(currentNode, outgoing, formData);
                currentNodeId = branchEdge.targetNodeId;
                continue;
            } else {
                // rect / ai-agent / circle：普通节点应仅有一条有效出边
                if (outgoing.length > 1) {
                    console.warn(`⚠️ [流程引擎] 普通节点【${currentNode.text?.value || currentNode.id}】存在 ${outgoing.length} 条出边，取第一条`);
                }
                currentNodeId = outgoing[0].targetNodeId;
                continue;
            }
        }

        return path;
    }

    // 发起审批
    async startWorkflow(formId: number, formData: Record<string, any>, userId: number, workflowId?: number) {
        console.log('startWorkflow', formId, formData, userId, workflowId);
        const form = await this.formRepo.findOne({ where: { id: formId } });
        if (!form) throw new BadRequestException('表单不存在');

        // 优先使用显式指定的 workflowId；若未传，则取当前表单下最新保存/修改的有效流程模板
        const workflow = workflowId
            ? await this.logicFlowRepository.findOne({ where: { id: workflowId } })
            : await this.logicFlowRepository.findOne({
                where: { formId },
                order: { updated_at: 'DESC', id: 'DESC' },
            });
        if (!workflow) throw new BadRequestException('未找到关联的审批流程');

        const graphData = workflow.graphData;
        const getNodeText = (node: any) => (typeof node?.text === 'string' ? node.text : node?.text?.value || '');
        const startNode = (graphData.nodes || []).find(node => node.type === 'circle' && getNodeText(node) === '开始');
        if (!startNode) throw new BadRequestException('流程起始节点缺失');

        const endtNode = (graphData.nodes || []).find(node => node.type === 'circle' && getNodeText(node) === '结束');
        if (!endtNode) throw new BadRequestException('流程结束节点缺失');

        // 查询申请人姓名
        const userName = await this.internalusersService.findOne(userId);
        formData.applicantName = userName?.name || '申请人';
        const title = `${form.name}申请 - ${new Date().toLocaleDateString()}`;

        let approvalHistory: any[] = [];
        approvalHistory.push({
            nodeId: 'start',
            userName: userName.name,
            userId,
            approvedAt: this.formatDate(new Date()),
        });

        // 1. 先快速创建并持久化审批实例（初始状态为 0=AI审核中），生成 instanceId
        const instance = this.instanceRepo.create({
            title,
            formData,
            status: '0', // 0=AI审核中/处理中, 1=待人工审批, 2=通过, 3=拒绝
            currentNodeId: startNode.id,
            applicantId: userId,
            userName: userName.name,
            approvalHistory,
            workflowId: workflow.id,
            formId: form.id,
            currentApproverId: null,
        });

        await this.instanceRepo.save(instance);

        // 2. 🚀 核心异步化改造：后台异步流转 AI 智能体与审批节点（解放 HTTP 接口，秒级返回前端）
        setImmediate(async () => {
            try {
                console.log(`🚀 [流程引擎] 实例 #${instance.id} 开始在后台异步执行 AI 审计与流程流转...`);
                // 递归流转（包括调用 AI Agent 审计，调用 LangGraph，评估条件分支等）
                const stepResult = await this.traverseToNextApprovalNode(
                    graphData,
                    startNode.id,
                    instance.formData,
                    instance.approvalHistory,
                    instance.id,
                );

                instance.status = stepResult.status;
                instance.currentNodeId = stepResult.currentNodeId;
                instance.currentApproverId = stepResult.currentApproverId;

                if (stepResult.isCompleted) {
                    const endNode = (graphData.nodes || []).find((n: any) => n.type === 'circle' && (n.text?.value === '结束' || n.properties?.endStatus));
                    instance.approvalHistory.push({
                        nodeId: endNode?.id || 'end',
                        title: '流程结束',
                        userName: '流程引擎',
                        status: stepResult.status,
                        comment: stepResult.finishReason || (stepResult.status === '2' ? '所有节点审批通过，流程完结' : '流程流转结束，予以驳回'),
                        approvedAt: this.formatDate(new Date()),
                    });
                }

                // 显式重新赋值，确保 TypeORM 能够识别到 JSON 字段的变更并更新到数据库
                instance.formData = { ...instance.formData };
                instance.approvalHistory = [...instance.approvalHistory];

                // 将 AI 审查后的表单数据、审查报告历史、当前节点及状态更新入库
                await this.instanceRepo.save(instance);
                console.log(`✅ [流程引擎] 实例 #${instance.id} 后台异步流转完成，当前状态: ${instance.status} (${stepResult.isCompleted ? (instance.status === '2' ? '自动通过完结' : '自动驳回完结') : `已流转至审批人 ID: ${instance.currentApproverId}`})`);
            } catch (asyncErr) {
                console.error(`❌ [流程引擎] 实例 #${instance.id} 后台异步流转发生异常:`, asyncErr);
                instance.approvalHistory.push({
                    nodeId: 'system_error',
                    title: '系统流转异常',
                    type: 'error',
                    userName: '系统告警',
                    comment: `流程后台异步执行异常: ${asyncErr.message}`,
                    approvedAt: this.formatDate(new Date()),
                });
                await this.instanceRepo.save(instance);
            }
        });

        // 3. ⚡ 立即向前端返回成功响应（耗时仅数十毫秒，前端无任何卡顿！）
        return {
            instanceId: instance.id,
            workflowName: workflow.name,
            status: '0',
            message: '申请已成功提交，AI 正在后台进行智能合规初审...',
        };
    }

    // 获取我的审批流程数据 (轻量列表，不返回 formData/approvalHistory/form，详情由 detail 接口获取)
    async getMyInstances(userId: number, page?: number, pageSize: number = 10): Promise<{ data: Partial<ApprovalInstance>[]; total: number }> {
        const pageNum = page && Number(page) > 0 ? Number(page) : 1;
        const size = pageSize && Number(pageSize) > 0 ? Number(pageSize) : 10;
        const [data, total] = await this.instanceRepo.findAndCount({
            where: { applicantId: userId },
            select: [
                'id',
                'title',
                'status',
                'currentNodeId',
                'applicantId',
                'userName',
                'workflowId',
                'formId',
                'currentApproverId',
                'created_at',
                'updated_at',
            ],
            skip: (pageNum - 1) * size,
            take: size,
            order: { id: 'DESC' }, // 最新发起的数据排在第一位
        });
        return { data, total };
    }

    // 获取我的代办任务列表 (轻量列表，不返回 formData/approvalHistory/form，详情由 detail 接口获取)
    async getMyTodoInstances(userId: number, page?: number, pageSize: number = 10): Promise<{ data: Partial<ApprovalInstance>[]; total: number }> {
        const pageNum = page && Number(page) > 0 ? Number(page) : 1;
        const size = pageSize && Number(pageSize) > 0 ? Number(pageSize) : 10;
        const [data, total] = await this.instanceRepo.findAndCount({
            where: {
                status: '1', // 待审批
                currentApproverId: userId, // 我是当前审批人
            },
            select: [
                'id',
                'title',
                'status',
                'currentNodeId',
                'applicantId',
                'userName',
                'workflowId',
                'formId',
                'currentApproverId',
                'created_at',
                'updated_at',
            ],
            skip: (pageNum - 1) * size,
            take: size,
            order: { id: 'DESC' }, // 最新优先
        });
        return { data, total };
    }

    // 处理审批(同意、拒绝)
    async approve(id: number, userId: number, status: string, comment: string) {
        const instance = await this.instanceRepo.findOne({
            where: { id },
            relations: ['workflow'],
        });

        if (!instance) throw new BadRequestException('流程实例不存在');
        if (instance.currentApproverId != userId) throw new BadRequestException('你不是该审批任务的当前审批人');
        if (instance.status != '1') throw new BadRequestException('该任务已处理，不可重复操作');

        const graphData = instance.workflow.graphData;
        const currentNodeId = instance.currentNodeId;
        const nodes = graphData.nodes || [];
        const currentNode = nodes.find(n => n.id === currentNodeId);

        // 🌟 核心兼容：如果当前挂起任务是 AI 智能体 (人机协同特批挂起)，无缝直通 resumeAiApproval 恢复流程
        if (currentNode && currentNode.type === 'ai-agent') {
            const userNameObj = await this.internalusersService.findOne(userId);
            return await this.resumeAiApproval(
                id,
                { approved: status === '2', comment },
                { userId, userName: userNameObj?.name || '特批复核人' },
            );
        }

        const validationErrors = this.validateWorkflow(graphData);
        if (validationErrors.length > 0) {
            console.error('❌ 流程图验证失败：', validationErrors);
            throw new BadRequestException('流程图设计不完整，请联系管理员：' + validationErrors.join('; '));
        }
        // 查询审批人姓名
        const userName = await this.internalusersService.findOne(userId);
        // 记录审批历史
        instance.approvalHistory.push({
            nodeId: currentNodeId,
            approverId: userId,
            userName: userName.name,
            status, // 2=通过, 3=拒绝
            comment: comment || '',
            approvedAt: this.formatDate(new Date()),
        });

        if (status == '3') {
            // 拒绝：流程结束
            instance.status = '3';
            instance.currentNodeId = null;
            instance.currentApproverId = null;
        } else if (status == '2') {
            // 同意：查找下一个审批节点
            try {
                const stepResult = await this.traverseToNextApprovalNode(graphData, currentNodeId, instance.formData, instance.approvalHistory, instance.id);
                console.log('找到下一个流转步骤:', stepResult);

                instance.status = stepResult.status;
                instance.currentNodeId = stepResult.currentNodeId;
                instance.currentApproverId = stepResult.currentApproverId;

                if (stepResult.isCompleted) {
                    const endNode = nodes.find(n => n.type === 'circle' && (n.text?.value === '结束' || n.properties?.endStatus));
                    instance.approvalHistory.push({
                        nodeId: endNode?.id || 'end',
                        title: '流程结束',
                        userName: '流程引擎',
                        status: stepResult.status,
                        comment: stepResult.finishReason || (stepResult.status === '2' ? '流程审批结束，全部通过' : '后续流程流转结束，予以驳回'),
                        approvedAt: this.formatDate(new Date()),
                    });
                    console.log(`流程结束，状态: ${stepResult.status === '2' ? '通过' : '驳回'}`);
                }
            } catch (error: any) {
                console.error('审批流转过程中发生错误：', error.message);
                throw new BadRequestException(`审批流程异常：${error.message}`);
            }
        } else {
            throw new BadRequestException('无效的审批状态');
        }

        return await this.instanceRepo.save(instance);
    }
    // 辅助函数：查找并执行下一个流转节点，支持多 AI 智能体串联审查、条件分支与人工审批
    private async traverseToNextApprovalNode(
        graphData: any,
        currentId: string,
        formData: Record<string, any>,
        approvalHistory?: any[],
        instanceId?: number,
    ): Promise<FlowStepResult> {
        const edges = graphData.edges || [];
        const nodes = graphData.nodes || [];

        // 1. 从当前已完成节点 currentId 出发，查找其第一条出边
        const currentEdge = edges.find(edge => edge.sourceNodeId === currentId);
        if (!currentEdge) {
            return this.resolveEndEvent(null, formData); // 无后续节点，流程结束
        }

        const nextNode = nodes.find(node => node.id === currentEdge.targetNodeId);
        if (!nextNode) throw new BadRequestException('下一个节点不存在');

        // 2. 将下游目标节点交由统一节点执行器处理
        return await this.processTargetNode(graphData, nextNode, formData, approvalHistory, instanceId);
    }

    /**
     * 核心流程节点执行器：处理指定的目标节点（targetNode），根据节点类型分发执行逻辑
     * - rect (人工审批): 返回当前审批人信息，流程挂起等待人工审批 (isCompleted: false, status: '1')
     * - ai-agent (AI智能审查): 调用 Agent 执行审查，注入结果/报告/历史，并自动沿着出边推进到下游目标节点
     * - diamond (条件判断): 评估条件表达式，选取匹配的分支边，递归推进到分支目标节点
     * - circle (结束节点): 委托终态裁决器 resolveEndEvent 依据 BPMN 结束事件属性与审计事实输出终态
     */
    private async processTargetNode(
        graphData: any,
        targetNode: any,
        formData: Record<string, any>,
        approvalHistory?: any[],
        instanceId?: number,
    ): Promise<FlowStepResult> {
        const edges = graphData.edges || [];
        const nodes = graphData.nodes || [];

        if (!targetNode) {
            return this.resolveEndEvent(null, formData);
        }

        if (targetNode.type === 'rect') {
            const assignee = targetNode.properties?.assignee;
            if (typeof assignee !== 'number' || assignee <= 0) {
                throw new BadRequestException(`审批节点 ${targetNode.text?.value || targetNode.id} 未配置有效审批人`);
            }

            // 直接返回当前审批节点，流程挂起等待人工审批
            return {
                isCompleted: false,
                status: '1',
                currentNodeId: targetNode.id,
                currentApproverId: assignee,
            };
        } else if (targetNode.type === 'ai-agent') {
            console.log('🤖 [流程引擎] 流转至通用 AI 智能体审查节点:', targetNode.id, targetNode.text?.value);
            // 自动提取表单附件文件列表（支持任意审批业务的附件上传）
            let attachmentFiles: any[] = [];
            for (const key of Object.keys(formData)) {
                if (Array.isArray(formData[key]) && formData[key].length > 0 && (formData[key][0]?.filePath || formData[key][0]?.url)) {
                    attachmentFiles = formData[key];
                    break;
                }
            }

            const agentRole = targetNode.properties?.agentRole || 'finance:invoice_audit';
            const riskThreshold = Number(targetNode.properties?.riskThreshold) || 80;

            // 尝试解析申请人所属法人公司信息（若表单未携带）
            await this.resolveApplicantCompanyInfo(formData);

            // 读取节点显式绑定的申报金额字段 (如 bxje)
            const amountField = targetNode.properties?.amountField;
            console.log('🤖 [流程引擎] 读取节点关联字段:', amountField, '值:', formData[amountField]);

            const declaredAmount = Number(formData[amountField] || 0);

            let auditResult: any = null;
            try {
                auditResult = await this.agentFlowService.executeAgentAudit(agentRole, {
                    instanceId: instanceId || 0,
                    formData,
                    files: attachmentFiles,
                    riskThreshold,
                    context: {
                        declaredAmount,
                    },
                });
            } catch (err) {
                console.error(`AI 审查 [${agentRole}] 执行异常，记录错误并降级:`, err);
                auditResult = {
                    complianceScore: 60,
                    pass: false,
                    summary: `AI 审查 [${agentRole}] 执行异常，转入人工复核`,
                    anomalyList: [{ type: 'other', severity: 'high', description: `AI执行失败: ${err.message}` }],
                    details: { fileCount: attachmentFiles.length, reasonCheck: '待人工复核', riskLevel: 'HIGH' },
                };
            }

            // 将 AI 审查结果注入 formData：
            // 1. 全局合规通过状态：采用【多智能体一票否决制】(任何一个 Agent 判定不合规，全局 ai_pass 立即锁定为 false)
            if (formData.ai_pass === undefined) {
                formData.ai_pass = auditResult.pass;
            } else {
                formData.ai_pass = Boolean(formData.ai_pass && auditResult.pass);
            }

            // 2. 全局合规得分：采用【木桶短板原则】(取所有经过 Agent 的最低分作为整单综合风控分)
            if (formData.complianceScore === undefined) {
                formData.complianceScore = auditResult.complianceScore;
            } else {
                formData.complianceScore = Math.min(Number(formData.complianceScore), Number(auditResult.complianceScore));
            }

            // 3. 角色专有字段（便于多 Agent 串行精细化条件: condition: "finance_invoice_audit_score >= 80"）
            const safeRoleKey = agentRole.replace(/[:\-]/g, '_');
            formData[`${safeRoleKey}_score`] = auditResult.complianceScore;
            formData[`${safeRoleKey}_pass`] = auditResult.pass;

            // 4. 节点专属字段（便于针对特定节点条件: condition: "node_xxx_score >= 80"）
            const safeNodeKey = String(targetNode.id).replace(/[:\-]/g, '_');
            formData[`${safeNodeKey}_score`] = auditResult.complianceScore;

            // 🌟 6. 将【AI 真实说的话】(结构化总结、原因、建议及原始报文) 进行防覆盖聚合
            const realSpeech = auditResult.aiRealSpeech || {
                summary: auditResult.summary,
                reasonCheck: auditResult.details?.reasonCheck,
                suggestions: auditResult.suggestions,
                rawOutput: auditResult.rawModelResponse,
            };

            // 多 Agent 报告集合存储 (每个 Agent 保留自己独立的报告)
            if (!formData.aiAuditReports) {
                formData.aiAuditReports = {};
            }
            formData.aiAuditReports[agentRole] = {
                role: agentRole,
                roleName: targetNode.properties?.agentRoleName || this.agentFlowService.getAgentRoleName(agentRole),
                score: auditResult.complianceScore,
                pass: auditResult.pass,
                summary: auditResult.summary,
                aiRealSpeech: realSpeech,
                auditResult,
            };

            // 全局 aiRealSpeech 防覆盖规则：
            // - 若当前 Agent 判定不通过 (pass === false)，驳回具有致命性，优先作为驳回审批理由；
            // - 若都通过，保留当前或拼接说明
            if (!formData.aiRealSpeech) {
                formData.aiRealSpeech = realSpeech;
            } else if (!auditResult.pass) {
                if (formData.aiRealSpeech.summary && !formData.aiRealSpeech.summary.includes(realSpeech.summary)) {
                    formData.aiRealSpeech = {
                        ...realSpeech,
                        summary: `${formData.aiRealSpeech.summary}；${realSpeech.summary}`,
                    };
                } else {
                    formData.aiRealSpeech = realSpeech;
                }
            }

            if (auditResult.isSuspended) {
                const specialApproverId = Number(targetNode.properties?.specialApproverId);
                if (!specialApproverId) {
                    throw new BadRequestException(`AI审查节点【${targetNode.text?.value || targetNode.id}】未配置人机协同特批人(HITL)`);
                }
                console.log(`⏸️ [流程引擎] AI节点 [${targetNode.text?.value || targetNode.id}] 触发人机协同挂起，等待特批人 [#${specialApproverId}] 审批`);

                formData._isSuspended = true;
                formData._suspendedNodeId = targetNode.id;
                formData._suspendedAgentRole = agentRole;
                formData._suspendedSuspendInfo = auditResult.suspendInfo;

                if (approvalHistory) {
                    approvalHistory.push({
                        nodeId: targetNode.id,
                        title: targetNode.text?.value || 'AI智能初审',
                        type: 'ai-agent',
                        status: '1', // 1=待特批审批
                        userName: targetNode.properties?.agentRoleName || this.agentFlowService.getAgentRoleName(agentRole),
                        comment: auditResult.summary,
                        isSuspended: true,
                        suspendInfo: auditResult.suspendInfo,
                        aiRealSpeech: realSpeech,
                        auditResult: auditResult,
                        approvedAt: this.formatDate(new Date()),
                    });
                }

                // 挂起中断，不再向下递归，返回当前节点与特批人
                return {
                    isCompleted: false,
                    status: '1',
                    currentNodeId: targetNode.id,
                    currentApproverId: specialApproverId,
                    finishReason: auditResult.summary,
                };
            }

            // 记录到审批历史 (存储入 approval_instances 数据库表)
            if (approvalHistory) {
                approvalHistory.push({
                    nodeId: targetNode.id,
                    title: targetNode.text?.value || 'AI智能初审',
                    type: 'ai-agent',
                    status: auditResult.pass ? '2' : '3', // 2=通过，3=存疑
                    userName: targetNode.properties?.agentRoleName || this.agentFlowService.getAgentRoleName(agentRole),
                    comment: auditResult.summary,
                    // 🌟 核心：在数据库审批流水中独立显式存储 AI 真实说的话与原始输出
                    aiRealSpeech: realSpeech,
                    rawModelResponse: auditResult.rawModelResponse,
                    auditResult: auditResult,
                    approvedAt: this.formatDate(new Date()),
                });
            }

            // 🚨 核心风控：若 AI 判定不通过 (pass === false)，且未被挂起等待特批
            // 说明单据存在不可调和的重大违规（如买方抬头不符、重复报销、金额严重不符等），直接一票否决驳回结单！
            // 绝不允许继续流转到下游去判断小额免审！
            if (!auditResult.pass) {
                console.log(`🚫 [流程引11擎] AI节点 [${targetNode.text?.value || targetNode.id}] 审查未通过且不可特批，流程直接驳回完结`);
                return {
                    isCompleted: true,
                    status: '3',
                    currentNodeId: null,
                    currentApproverId: null,
                    finishReason: auditResult.summary || 'AI智能初审不合规，单据已驳回',
                };
            }

            // 继续查找该 AI 节点的后续节点
            const nextEdge = edges.find(edge => edge.sourceNodeId === targetNode.id);
            if (!nextEdge) {
                return this.resolveEndEvent(targetNode, formData);
            }
            const nextNode = nodes.find(node => node.id === nextEdge.targetNodeId);
            if (!nextNode) throw new BadRequestException('AI节点后续节点不存在');

            // 递归向下处理下一个目标节点（下一个可能是 diamond 条件分支，或者另一个 ai-agent，或者 rect 人工审批，或者 circle 结束）
            return await this.processTargetNode(graphData, nextNode, formData, approvalHistory, instanceId);
        } else if (targetNode.type === 'diamond') {
            // 🌟 工业级排他网关（Exclusive Gateway）：使用统一多条件仲裁器
            const branchEdges = edges.filter(edge => edge.sourceNodeId === targetNode.id);
            if (branchEdges.length === 0) throw new BadRequestException('条件网关缺少出边');

            const branchEdge = this.resolveConditionBranchEdge(targetNode, branchEdges, formData);
            const branchTargetNode = nodes.find(n => n.id === branchEdge.targetNodeId);
            if (!branchTargetNode) throw new BadRequestException('分支目标节点不存在');

            // 分支选中的目标节点直接交由 processTargetNode 处理！
            // 无论是 rect 人工审批、ai-agent 智能体、还是另一个 diamond 条件节点，均能正确执行，绝不跳步！
            return await this.processTargetNode(graphData, branchTargetNode, formData, approvalHistory, instanceId);
        } else if (targetNode.type === 'circle' && (targetNode.text?.value === '结束' || targetNode.properties?.endStatus || targetNode.properties?.endType)) {
            return this.resolveEndEvent(targetNode, formData);
        } else {
            throw new BadRequestException(`不支持的节点类型: ${targetNode.type}`);
        }
    }
    /**
     * 🌟 排他网关（Exclusive Gateway）分支仲裁器 (按出边 condition 顺序仲裁，命中即走；未命中走 isDefault 兜底)
     */
    private resolveConditionBranchEdge(diamondNode: any, outgoingEdges: any[], formData: Record<string, any>): any {
        const nodeName = diamondNode.text?.value || diamondNode.id;

        // 1. 依次评估非默认分支连线（按出边顺序，首个命中即走）
        for (const edge of outgoingEdges) {
            if (edge.properties?.isDefault) continue;
            const condition = edge.properties?.condition;
            if (condition && this.evaluateCondition(condition, formData)) {
                console.log(`🎯 [排他网关:${nodeName}] 命中分支【${edge.text?.value || edge.id}】(条件: ${condition})`);
                this.checkBranchAction(edge, formData);
                return edge;
            }
        }

        // 2. 前置条件全未命中，走默认兜底分支（Else）
        const defaultEdge = outgoingEdges.find(e => e.properties?.isDefault);
        if (defaultEdge) {
            console.log(`⚠️ [排他网关:${nodeName}] 前置分支均未命中，走默认兜底连线【${defaultEdge.text?.value || defaultEdge.id}】`);
            this.checkBranchAction(defaultEdge, formData);
            return defaultEdge;
        }

        throw new BadRequestException(
            `条件网关【${nodeName}】所有分支条件均未满足，且未配置默认兜底连线（请在一条出边上设置默认分支 isDefault）！`,
        );
    }

    /**
     * 连线分支动作执行器：严格基于结构化元数据（action / branchType）判定，无任何文本正则猜测
     */
    private checkBranchAction(edge: any, formData: Record<string, any>) {
        if (edge.properties?.action === 'reject' || edge.properties?.branchType === 'reject') {
            formData._isRejected = true;
            formData._rejectedReason = edge.properties?.remark || '分支连线配置为驳回流转';
        }
    }

    /**
     * 🌟 标准终态仲裁器：依据 BPMN 结束事件定义、连线动作属性与审计事实，输出严谨的终态决策
     */
    private resolveEndEvent(endNode: any, formData: Record<string, any>): FlowStepResult {
        // 1. 显式配置的结束节点终态 (BPMN End Event Type)
        const endStatus = endNode?.properties?.endStatus || (endNode?.properties?.endType === 'reject' ? '3' : endNode?.properties?.endType === 'pass' ? '2' : null);
        if (endStatus === '3') {
            return {
                isCompleted: true,
                status: '3',
                currentNodeId: null,
                currentApproverId: null,
                finishReason: endNode.properties?.remark || '流转至驳回结束事件，流程驳回完结',
            };
        }
        if (endStatus === '2') {
            return {
                isCompleted: true,
                status: '2',
                currentNodeId: null,
                currentApproverId: null,
                finishReason: endNode.properties?.remark || '流转至通过结束事件，流程通过完结',
            };
        }

        // 2. 检查前置分支连线显式配置的动作 (Branch Action: reject)
        if (formData._isRejected) {
            return {
                isCompleted: true,
                status: '3',
                currentNodeId: null,
                currentApproverId: null,
                finishReason: formData._rejectedReason || '网关分支触发驳回动作，流程驳回完结',
            };
        }

        // 3. 业务事实一致性门禁 (Fact-based Audit Gate):
        // 业务智能体给出了不合规审查结论 (pass === false)，且后续未经任何特批放行，自然到达普通结束事件判定为驳回
        if (formData.ai_pass === false) {
            return {
                isCompleted: true,
                status: '3',
                currentNodeId: null,
                currentApproverId: null,
                finishReason: formData.aiRealSpeech?.summary || '前置智能体合规审查未达标，流程驳回完结',
            };
        }

        // 4. 正常流转通过
        return {
            isCompleted: true,
            status: '2',
            currentNodeId: null,
            currentApproverId: null,
            finishReason: '所有节点审批通过，流程正常完结',
        };
    }

    /**
     * 辅助函数：根据表单申请人自动解析所属法人公司（仅当表单中尚未携带 _companyInfo 时）
     */
    private async resolveApplicantCompanyInfo(formData: Record<string, any>): Promise<void> {
        if (!formData || formData._companyInfo) return;
        try {
            const applicantId = Number(formData.userId || formData.applicantId);
            if (!applicantId) return;
            const user = await this.internalusersService.findOne(applicantId);
            if (user?.organid) {
                const orgService = (this.internalusersService as any).orgManagementService;
                if (orgService) {
                    const company = await orgService.findCompanyByOrgId(user.organid);
                    if (company) {
                        formData._companyInfo = {
                            companyName: company.legalEntityName || company.organame,
                            taxCode: company.taxCode,
                            organid: company.organid,
                        };
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ [流程引擎] 获取申请人所属公司主体异常:', e.message);
        }
    }

    // 辅助函数：评估条件表达式（纯通用沙箱环境，自动数值类型转换 + 杜绝未定义变量抛错）
    private evaluateCondition(condition: string, formData: Record<string, any>): boolean {
        if (!condition || !condition.trim()) {
            console.warn('⚠️ [条件评估] 条件表达式缺失，默认返回 false');
            return false;
        }

        try {
            // 使用 Proxy 拦截所有变量访问，无论访问 days、totalAmount 还是任意业务字段，未填时安全返回 undefined，彻底杜绝 "xxx is not defined" 错误
            const sandbox = new Proxy(formData || {}, {
                has() {
                    return true;
                },
                get(target, prop: string | symbol) {
                    if (typeof prop !== 'string') return undefined;
                    if (prop in target) {
                        const val = target[prop];
                        // 字符串纯数字自动转为 Number，支持表达式中的数值计算与大小比较（如 "3" >= 3）
                        if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                            return Number(val);
                        }
                        return val;
                    }
                    return undefined;
                },
            });

            const evalFn = new Function('sandbox', `with(sandbox) { return !!(${condition}); }`);
            const result = Boolean(evalFn(sandbox));
            console.log(`🔍 [条件评估] 表达式 "${condition}" 评估结果: ${result}`);
            return result;
        } catch (e) {
            console.warn(`⚠️ [条件评估] 条件 "${condition}" 执行异常 (${e.message})，安全降级为 false`);
            return false;
        }
    }

    private validateWorkflow(graphData: any): string[] {
        const errors: string[] = [];
        const nodes = graphData.nodes || [];
        const edges = graphData.edges || [];

        const nodeIds = new Set(nodes.map(n => n.id));
        const hasOutgoing = new Set<string>();

        // 标记所有有出边的节点
        for (const edge of edges) {
            if (!nodeIds.has(edge.sourceNodeId)) {
                errors.push(`边 ${edge.id} 的源节点 ${edge.sourceNodeId} 不存在`);
            }
            if (!nodeIds.has(edge.targetNodeId)) {
                errors.push(`边 ${edge.id} 的目标节点 ${edge.targetNodeId} 不存在`);
            }
            hasOutgoing.add(edge.sourceNodeId);
        }

        // 检查所有 rect 和 ai-agent 节点是否有出边
        for (const node of nodes) {
            if ((node.type === 'rect' || node.type === 'ai-agent') && !hasOutgoing.has(node.id)) {
                errors.push(`节点【${node.text?.value || node.id}】没有连接后续节点，请检查流程完整性`);
            }
        }

        // 🌟 校验条件网关（Diamond）节点：必须至少有 2 条出边
        for (const node of nodes) {
            if (node.type === 'diamond') {
                const diamondOutgoing = edges.filter((e: any) => e.sourceNodeId === node.id);
                if (diamondOutgoing.length < 2) {
                    errors.push(`条件网关【${node.text?.value || node.id}】必须至少连接 2 条分支连线（当前仅有 ${diamondOutgoing.length} 条）`);
                }
                // 检查是否配置了条件（出边或节点至少有一处配了条件）
                const hasEdgeCond = diamondOutgoing.some(e => e.properties?.condition || e.properties?.isDefault);
                const hasNodeCond = !!node.properties?.condition;
                if (!hasEdgeCond && !hasNodeCond) {
                    errors.push(`条件网关【${node.text?.value || node.id}】尚未配置任何条件表达式（请在出边或节点上配置）`);
                }
            }
        }

        // 🌟 节点人员配置强校验
        for (const node of nodes) {
            const nodeTitle = (typeof node?.text === 'string' ? node.text : node?.text?.value) || node.id;
            if (node.type === 'rect' && !node.properties?.assignee) {
                errors.push(`审批节点【${nodeTitle}】未配置审批人`);
            }
            if (node.type === 'ai-agent' && !node.properties?.specialApproverId) {
                errors.push(`AI智能审查节点【${nodeTitle}】必须配置人机协同特批人(HITL)`);
            }
        }

        return errors;
    }

    // 格式化时间为 YYYY-MM-DD HH:mm:ss
    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // 格式化任意时间字符串为标准的本地 YYYY-MM-DD HH:mm:ss
    private formatDateString(dateStr?: string | null): string | null {
        if (!dateStr) return null;
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) return dateStr;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return this.formatDate(d);
    }

    /**
     * 🌟 人机协同 (HITL)：特批审核人唤醒挂起的 AI 智能体并驱动下游流转
     */
    async resumeAiApproval(instanceId: number, dto: { approved: boolean; comment?: string }, currentUser: any) {
        const instance = await this.instanceRepo.findOne({
            where: { id: instanceId },
            relations: ['workflow'],
        });

        if (!instance) {
            throw new BadRequestException('审批实例不存在');
        }

        // 校验权限：当前用户必须是特批复核人
        if (Number(instance.currentApproverId) !== Number(currentUser?.userId)) {
            throw new BadRequestException('无特批放行权限，只有当前指定的特批复核人才能操作');
        }

        const graphData = instance.workflow.graphData;
        const nodes = graphData.nodes || [];
        const edges = graphData.edges || [];
        const currentNode = nodes.find(n => n.id === instance.currentNodeId);

        if (!currentNode || currentNode.type !== 'ai-agent') {
            throw new BadRequestException('当前流程节点未处于 AI 挂起等待特批状态');
        }

        const agentRole = currentNode.properties?.agentRole;
        if (!agentRole) {
            throw new BadRequestException('AI节点未配置智能体角色 agentRole');
        }

        console.log(`▶️ [流程引擎] 用户 [${currentUser.userName || currentUser.userId}] 正在对实例 #${instanceId} 执行 AI 特批恢复 (决定: ${dto.approved ? '放行' : '驳回'})`);

        // 1. 调用 AgentFlowService 唤醒挂起的 LangGraph
        const resumedAuditResult = await this.agentFlowService.resumeAgentAudit(agentRole, {
            instanceId,
            approved: dto.approved,
            comment: dto.comment,
            approverId: currentUser.userId,
            approverName: currentUser.userName || '特批复核人',
            formData: instance.formData,
            files: instance.formData?.files || [],
            extraData: {
                formData: instance.formData,
                files: instance.formData?.files || [],
                savedBudgetResult: instance.formData?.aiAuditReports?.['finance:budget_control'],
            },
        });

        // 2. 记录特批审批历史
        const approvalActionText = dto.approved ? '同意特批放行' : '驳回特批申请';
        instance.approvalHistory = instance.approvalHistory || [];
        instance.approvalHistory.push({
            nodeId: currentNode.id,
            title: `${currentNode.text?.value || 'AI智能初审'} - 人工特批`,
            type: 'special-approval',
            status: dto.approved ? '2' : '3',
            userName: currentUser.userName || '特批复核人',
            comment: dto.comment || approvalActionText,
            approvedAt: this.formatDate(new Date()),
            specialApproval: resumedAuditResult?.specialApproval,
        });

        // 🌟 同步将该 AI 节点的挂起历史记录置为已恢复处理，解除挂起标记与回写审计结果
        const previousSuspendedHistory = instance.approvalHistory.find(h => h.nodeId === currentNode.id && h.type === 'ai-agent');
        if (previousSuspendedHistory) {
            previousSuspendedHistory.status = dto.approved ? '2' : '3';
            previousSuspendedHistory.isSuspended = false;
            if (resumedAuditResult?.summary) {
                previousSuspendedHistory.comment = resumedAuditResult.summary;
            }
            if (resumedAuditResult) {
                previousSuspendedHistory.auditResult = resumedAuditResult;
                previousSuspendedHistory.specialApproval = resumedAuditResult.specialApproval;
            }
        }

        // 3. 更新 formData 状态与审计结果 (彻底清理挂起标记)
        if (!instance.formData) instance.formData = {};
        instance.formData._isSuspended = false;
        delete instance.formData._suspendedNodeId;
        delete instance.formData._suspendedSuspendInfo;
        delete instance.formData._suspendedAgentRole;
        instance.formData.ai_pass = Boolean(dto.approved);
        // 🌟 尊重客观打分：特批是行政放行决策，永远不篡改 AI 原始客观评分
        const originalScore = Number(resumedAuditResult?.complianceScore ?? instance.formData.complianceScore ?? 50);
        instance.formData.complianceScore = originalScore;

        if (resumedAuditResult) {
            resumedAuditResult.complianceScore = originalScore;
            (resumedAuditResult as any).score = originalScore;
        }

        // 同步更新 aiAuditReports
        if (instance.formData.aiAuditReports && instance.formData.aiAuditReports[agentRole]) {
            instance.formData.aiAuditReports[agentRole].pass = Boolean(dto.approved);
            instance.formData.aiAuditReports[agentRole].score = originalScore;
            instance.formData.aiAuditReports[agentRole].complianceScore = originalScore;
            instance.formData.aiAuditReports[agentRole].summary = resumedAuditResult?.summary || '';
            instance.formData.aiAuditReports[agentRole].specialApproval = resumedAuditResult?.specialApproval;
            if (resumedAuditResult) {
                instance.formData.aiAuditReports[agentRole].auditResult = resumedAuditResult;
            }
        }

        if (!dto.approved) {
            // 特批人直接驳回：单据终结，状态置为驳回 3
            instance.status = '3';
            instance.currentNodeId = null;
            instance.currentApproverId = null;
            console.log(`❌ [流程引擎] 实例 #${instanceId} 经特批人驳回，流程结束`);
            return await this.instanceRepo.save(instance);
        }

        // 4. 特批放行：沿着 AI 节点的出边自动向下继续推进后续节点！
        const nextEdge = edges.find(edge => edge.sourceNodeId === currentNode.id);
        if (!nextEdge) {
            // 无后续出边，流程直接完结并通过
            instance.status = '2';
            instance.currentNodeId = null;
            instance.currentApproverId = null;
            const endNode = nodes.find(n => n.type === 'circle' && n.text?.value === '结束');
            instance.approvalHistory.push({
                nodeId: endNode?.id || 'end',
                title: '流程结束',
                userName: '流程引擎',
                status: '2',
                comment: '特批放行且无后续节点，流程通过结单',
                approvedAt: this.formatDate(new Date()),
            });
            console.log(`🎉 [流程引擎] 实例 #${instanceId} 特批放行且无后续节点，流程通过结单`);
            return await this.instanceRepo.save(instance);
        }

        const nextNode = nodes.find(node => node.id === nextEdge.targetNodeId);
        if (!nextNode) throw new BadRequestException('AI节点后续节点不存在');

        // 🚀 核心异步化改造（参考 startWorkflow 发起接口机制）：
        // 将单据先置为 status = '0' (后台处理中)，立即保存并返回，释放 HTTP 请求，杜绝大模型调用卡死！
        instance.status = '0';
        instance.currentNodeId = nextNode.id;
        instance.currentApproverId = null;
        instance.formData = { ...instance.formData };
        instance.approvalHistory = [...instance.approvalHistory];
        const savedInstance = await this.instanceRepo.save(instance);

        setImmediate(async () => {
            try {
                console.log(`🚀 [流程引擎] 实例 #${instanceId} 特批放行后，开始在后台异步推进下游智能体与审批节点...`);
                const stepResult = await this.processTargetNode(
                    graphData,
                    nextNode,
                    savedInstance.formData,
                    savedInstance.approvalHistory,
                    savedInstance.id,
                );

                savedInstance.status = stepResult.status;
                savedInstance.currentNodeId = stepResult.currentNodeId;
                savedInstance.currentApproverId = stepResult.currentApproverId;

                if (stepResult.isCompleted) {
                    const endNode = nodes.find(n => n.type === 'circle' && (n.text?.value === '结束' || n.properties?.endStatus));
                    savedInstance.approvalHistory.push({
                        nodeId: endNode?.id || 'end',
                        title: '流程结束',
                        userName: '流程引擎',
                        status: stepResult.status,
                        comment: stepResult.finishReason || (stepResult.status === '2' ? '特批放行且后续所有节点审批通过，流程完结' : '特批后续流程流转结束，予以驳回'),
                        approvedAt: this.formatDate(new Date()),
                    });
                }
                savedInstance.formData = { ...savedInstance.formData };
                savedInstance.approvalHistory = [...savedInstance.approvalHistory];
                await this.instanceRepo.save(savedInstance);
                console.log(`✅ [流程引擎] 实例 #${instanceId} 特批下游异步流转完成，当前状态: ${savedInstance.status} (${stepResult.isCompleted ? (savedInstance.status === '2' ? '自动通过完结' : '自动驳回完结') : `已流转至审批人 ID: ${savedInstance.currentApproverId}`})`);
            } catch (asyncErr: any) {
                console.error(`❌ [流程引擎] 实例 #${instanceId} 特批下游异步流转发生异常:`, asyncErr);
                savedInstance.approvalHistory.push({
                    nodeId: 'system_error',
                    title: '系统流转异常',
                    type: 'error',
                    userName: '系统告警',
                    comment: `特批下游异步流转异常: ${asyncErr.message}`,
                    approvedAt: this.formatDate(new Date()),
                });
                await this.instanceRepo.save(savedInstance);
            }
        });

        return savedInstance;
    }
}
