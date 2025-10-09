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
    ) {}

    async create(createLogicFlowDto: CreateLogicFlowDto): Promise<LogicFlow> {
        // 判断 createLogicFlowDto.graphData.nodes 最后一个节点是结束节点必须是圆形并且文字是结束
        const nodes = createLogicFlowDto.graphData.nodes;
        const validationErrors = this.validateWorkflow(createLogicFlowDto.graphData);
        if (validationErrors.length > 0) {
            console.error('❌ 流程图验证失败：', validationErrors);
            throw new BadRequestException('流程图设计不完整，请联系管理员：' + validationErrors.join('; '));
        }

        // 判断开始节点
        if (nodes[0].type !== 'circle' || nodes[0].text.value !== '开始') {
            throw new BadRequestException('流程图错误，请检查开始节点');
        }
        // 在判断如果是审批节点 type == rect 那么必须要有审批人
        for (let index = 0; index < nodes.length; index++) {
            const element = nodes[index];
            if (element.type === 'rect' && !element.properties?.assignee) {
                throw new BadRequestException(`流程图错误，存在审批节点未配置审批人`);
            }
        }
        if (nodes[nodes.length - 1].type !== 'circle' || nodes[nodes.length - 1].text.value !== '结束') {
            throw new BadRequestException('流程图错误，请检查结束节点');
        }
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

        // 1. 按实例的 formData 计算出“实际执行路径”，包含开始、diamond、rect、结束（按顺序）
        const pathNodes = this.buildExecutionPath(graphData, instance.formData);

        // 2. 只保留我们需要显示的节点（排除 diamond 条件节点）
        let steps = pathNodes
            .filter(node => node.type === 'rect' || node.text?.value === '开始' || node.text?.value === '结束')
            .map(node => {
                // 匹配审批历史：
                // - 普通审批节点的 history.nodeId 存的是节点 id
                // - 发起时我们在 startWorkflow 存的是 nodeId: 'start'（兼容）
                const history = instance.approvalHistory.find(h => h.nodeId === node.id || (node.text?.value === '开始' && h.nodeId === 'start'));

                return {
                    nodeId: node.id,
                    title: node.text?.value || '未知节点',
                    type: node.type,
                    assignee: node.properties?.assignee,
                    // status: history 有就用历史；否则如果是当前节点则 1（审批中），否则 0（未开始）
                    status: history ? history.status : node.id === instance.currentNodeId ? '1' : '', // 1=审批中,没下个节点就设置成2
                    userName: history?.userName || node.properties?.assigneeName || null,
                    approvedAt: history ? history.approvedAt : null,
                    comment: history ? history.comment : null,
                };
            });
        // 判断倒数第二个节点如果是通过的 2 就把最后一个结束节点设置成2完成
        if (steps[steps.length - 1]?.type === 'circle' && steps[steps.length - 1]?.title == '结束') {
            // 使用 some 检查是否存在 status 为 '3' 的节点
            const hasRejectedNode = steps.some(step => step.status == '3');
            if (hasRejectedNode) {
                // 如果存在 status 为 '3' 的节点，将最后一个节点设置为 '3'
                steps[steps.length - 1].status = '3';
            } else if (steps[steps.length - 2]?.status == '2') {
                steps[steps.length - 1].status = '2';
            }
        }

        return {
            instanceId: instance.id,
            title: instance.title,
            status: instance.status,
            currentNodeId: instance.currentNodeId,
            currentApproverId: instance.currentApproverId,
            steps,
            edges,
        };
    }

    /**
     * 按 formData 从“开始”节点向下遍历出实际执行路径（包含节点对象，按顺序）
     * - 遇到 diamond：根据 condition 选择 '是' 或 '否' 分支（匹配 edge.text.value）
     * - 遇到 rect 或 circle：默认取第一条合适的出边
     * - 防止死循环（visited + safety limit）
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

        while (currentNodeId && safety < 200) {
            safety++;
            if (visited.has(currentNodeId)) {
                break;
            }
            visited.add(currentNodeId);

            const currentNode = nodeMap.get(currentNodeId) as any;
            if (!currentNode) break;
            path.push(currentNode);

            // 如果是结束节点，结束
            if (currentNode.type === 'circle' && currentNode.text?.value === '结束') {
                break;
            }

            // 找出出边
            const outgoing = edges.filter((e: any) => e.sourceNodeId === currentNodeId);
            if (!outgoing || outgoing.length === 0) break;

            if (currentNode.type === 'diamond') {
                // 评估条件，选择 '是' / '否'
                const condition = currentNode.properties?.condition;
                const isTrue = this.evaluateCondition(condition, formData);
                let branchEdge = outgoing.find((e: any) => e.text?.value === (isTrue ? '是' : '否'));
                if (!branchEdge) {
                    // 兜底：如果没有标注“是/否”的 edge，则取第一个（
                    branchEdge = outgoing[0];
                }
                currentNodeId = branchEdge.targetNodeId;
                continue;
            } else {
                // rect 或 circle：优先选无文本标签的出边（普通连线），否则取第一个
                let nextEdge = outgoing.find((e: any) => !e.text?.value) || outgoing[0];
                if (!nextEdge) break;
                currentNodeId = nextEdge.targetNodeId;

                // 如果下一个是结束节点，将会在下一循环被加入并 break
                continue;
            }
        }

        return path;
    }

    // 发起审批
    async startWorkflow(formId: number, formData: Record<string, any>, userId: number) {
        console.log('startWorkflow', formId, formData, userId);
        const form = await this.formRepo.findOne({ where: { id: formId } });
        if (!form) throw new BadRequestException('表单不存在');

        const workflow = await this.logicFlowRepository.findOne({ where: { formId } });
        if (!workflow) throw new BadRequestException('未找到关联的审批流程');

        const graphData = workflow.graphData;
        const startNode = (graphData.nodes || []).find(node => node.type === 'circle' && node.text?.value === '开始');
        if (!startNode) throw new BadRequestException('流程起始节点缺失');

        const endtNode = (graphData.nodes || []).find(node => node.type === 'circle' && node.text?.value === '结束');
        if (!endtNode) throw new BadRequestException('流程结束节点缺失');

        // 递归查找第一个审批节点
        const nextNodeInfo = this.traverseToNextApprovalNode(graphData, startNode.id, formData);
        if (!nextNodeInfo) throw new BadRequestException('流程无有效审批节点');
        // 查询申请人姓名
        const userName = await this.internalusersService.findOne(userId);
        const title = `${form.name}申请 - ${new Date().toLocaleDateString()}`;

        let approvalHistory = [];
        approvalHistory.push({
            nodeId: 'start',
            userName: userName.name,
            userId,
            approvedAt: this.formatDate(new Date()),
        });

        const instance = this.instanceRepo.create({
            title,
            formData,
            status: '1', // 待审批
            currentNodeId: nextNodeInfo.id,
            applicantId: userId,
            userName: userName.name,
            approvalHistory,
            workflowId: workflow.id,
            formId: form.id,
            currentApproverId: nextNodeInfo.assignee,
        });

        await this.instanceRepo.save(instance);
        return { instanceId: instance.id, workflowName: workflow.name };
    }

    // 获取我的审批流程数据
    async getMyInstances(userId: number, page?: number, pageSize: number = 10): Promise<{ data: ApprovalInstance[]; total: number }> {
        const [data, total] = await this.instanceRepo.findAndCount({
            where: { applicantId: userId },
            relations: ['form', 'workflow'],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return { data: data, total };
    }

    // 获取我的代办任务列表
    async getMyTodoInstances(userId: number, page?: number, pageSize: number = 10): Promise<{ data: ApprovalInstance[]; total: number }> {
        const [data, total] = await this.instanceRepo.findAndCount({
            where: {
                status: '1', // 待审批
                currentApproverId: userId, // 我是当前审批人
            },
            relations: ['form', 'workflow'],
            skip: (page - 1) * pageSize,
            take: pageSize,
            order: { created_at: 'DESC' }, // 最新优先
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
                const nextNodeInfo = this.traverseToNextApprovalNode(graphData, currentNodeId, instance.formData);
                console.log('找到下一个节点', nextNodeInfo);

                if (nextNodeInfo) {
                    instance.status = '1';
                    instance.currentNodeId = nextNodeInfo.id;
                    instance.currentApproverId = nextNodeInfo.assignee;
                } else {
                    console.log('流程结束，通过');
                    instance.status = '2';
                    instance.currentNodeId = null;
                    instance.currentApproverId = null;
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
    // 辅助函数：递归查找下一个审批节点（rect），处理条件分支
    private traverseToNextApprovalNode(graphData: any, currentId: string, formData: Record<string, any>): { id: string; assignee: number } | null {
        const edges = graphData.edges || [];
        const nodes = graphData.nodes || [];

        const currentEdge = edges.find(edge => edge.sourceNodeId === currentId);
        if (!currentEdge) {
            return null; // 无后续节点，流程结束
        }

        const nextNodeId = currentEdge.targetNodeId;
        const nextNode = nodes.find(node => node.id === nextNodeId);
        if (!nextNode) throw new BadRequestException('下一个节点不存在');

        if (nextNode.type === 'rect') {
            const assignee = nextNode.properties?.assignee;
            if (typeof assignee !== 'number' || assignee <= 0) {
                throw new BadRequestException(`审批节点 ${nextNode.text?.value} 未配置有效审批人`);
            }

            // 直接返回当前审批节点，不要继续递归
            return { id: nextNode.id, assignee };
        } else if (nextNode.type === 'diamond') {
            // 条件节点：评估条件并选择分支
            const condition = nextNode.properties?.condition;
            const isTrue = this.evaluateCondition(condition, formData);
            const branchEdges = edges.filter(edge => edge.sourceNodeId === nextNodeId);
            if (branchEdges.length === 0) throw new BadRequestException('条件节点缺少出边');
            const branchEdge = branchEdges.find(edge => edge.text?.value === (isTrue ? '是' : '否'));
            if (!branchEdge) {
                throw new BadRequestException(`条件节点缺少 ${isTrue ? '是' : '否'} 分支`);
            }
            const targetNode = nodes.find(n => n.id === branchEdge.targetNodeId);
            if (!targetNode) throw new BadRequestException('分支目标节点不存在');
            //  如果分支直接指向 rect，直接返回，不要再递归
            if (targetNode.type === 'rect') {
                const assignee = targetNode.properties?.assignee;
                if (typeof assignee != 'number' || assignee <= 0) {
                    throw new BadRequestException(`审批节点 ${targetNode.text?.value} 未配置有效审批人`);
                }
                return { id: targetNode.id, assignee };
            }
            // 递归调用，处理下一个节点
            return this.traverseToNextApprovalNode(graphData, branchEdge.targetNodeId, formData);
        } else if (nextNode.type === 'circle' && nextNode.text?.value === '结束') {
            return null; // 到达结束节点
        } else {
            throw new BadRequestException(`不支持的节点类型: ${nextNode.type}`);
        }
    }
    // 辅助函数：评估条件表达式
    private evaluateCondition(condition: string, formData: Record<string, any>): boolean {
        if (!condition) throw new BadRequestException('条件表达式缺失');
        console.log('condition:', condition, formData);
        let expr = condition;
        for (const key in formData) {
            let value = formData[key];
            if (typeof value === 'string' && !isNaN(Number(value))) {
                value = Number(value);
            }
            expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), JSON.stringify(value));
        }
        try {
            return !!eval(expr); // 警告：eval不安全，生产环境中替换为安全解析器
        } catch (e) {
            throw new BadRequestException(`条件评估失败: ${e.message}`);
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

        // 检查所有 rect 节点是否有出边（除非是最后一个审批）
        for (const node of nodes) {
            if (node.type === 'rect' && !hasOutgoing.has(node.id)) {
                errors.push(`审批节点 "${node.text?.value}" 没有连接后续节点，请检查流程完整性`);
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
}
