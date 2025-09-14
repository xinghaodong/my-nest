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
        const logicFlow = this.logicFlowRepository.create(createLogicFlowDto);
        console.log(logicFlow, 'logicFlow');
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

    // 发起审批
    async startWorkflow(formId: number, formData: Record<string, any>, userId: number) {
        const form = await this.formRepo.findOne({ where: { id: formId } });
        if (!form) throw new BadRequestException('表单不存在');

        const workflow = await this.logicFlowRepository.findOne({ where: { formId } });
        if (!workflow) throw new BadRequestException('未找到关联的审批流程');

        const graphData = workflow.graphData;

        const startNode = (graphData.nodes || []).find(node => node.type === 'circle' && node.text?.value === '开始');
        if (!startNode) throw new BadRequestException('流程起始节点缺失');

        //  找到下一个节点 第一个 rect 审批节点,下边是跳过非审批几点的代码
        const edges = graphData.edges || [];
        const nextEdge = edges.find(edge => edge.sourceNodeId === startNode.id);
        if (!nextEdge) throw new BadRequestException('流程缺少连接线');
        const nextNodeId = nextEdge.targetNodeId;
        const nextNode = (graphData.nodes || []).find(node => node.id === nextNodeId);
        if (!nextNode) throw new BadRequestException('下一个节点不存在');
        // 根据userId 查询对应的用户名
        const userName = await this.internalusersService.findOne(userId);
        //  只有 type === "rect" 的节点才有审批人
        let currentApproverId: number | null = null;

        if (nextNode.type === 'rect') {
            const assignee = nextNode.properties?.assignee;
            if (typeof assignee !== 'number' || assignee <= 0) {
                throw new BadRequestException(`审批节点 ${nextNode.text?.value} 未配置有效审批人`);
            }
            currentApproverId = assignee;
        } else {
            throw new BadRequestException('流程的第一个审批节点不是矩形节点');
        }

        const title = `${form.name}申请 - ${new Date().toLocaleDateString()}`;
        const instance = this.instanceRepo.create({
            title,
            formData,
            status: 1,
            currentNodeId: nextNodeId,
            applicantId: userId,
            userName: userName.name,
            approvalHistory: [],
            workflowId: workflow.id,
            formId: form.id,
            currentApproverId, // 从下一个 rect 节点取 assignee
        });
        console.log('instance', instance);
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
                status: 1, // 待审批
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
    async approve(instanceId: number, userId: number, status: number, comment: string) {
        // instanceId 主键id userId 当前用户id  status  2=通过, 3=拒绝, comment 批注

        const instance = await this.instanceRepo.findOne({
            where: { id: instanceId },
            relations: ['workflow'], // 加载 workflow.graphData
        });

        if (!instance) throw new BadRequestException('流程实例不存在');
        console.log('instance', instance.currentApproverId, userId);
        console.log('instance11');
        //  权限校验：只有当前审批人才能操作
        if (instance.currentApproverId != userId) {
            throw new BadRequestException('你不是该审批任务的当前审批人');
        }

        // 只允许处理待审批状态的任务
        if (instance.status != 1) {
            throw new BadRequestException('该任务已处理，不可重复操作');
        }
        const graphData = instance.workflow.graphData;
        const currentNodeId = instance.currentNodeId;

        // 记录本次审批历史
        const approvalRecord = {
            nodeId: currentNodeId,
            approverId: userId,
            status: status, // 2=通过, 3=拒绝
            comment: comment || '',
            approvedAt: new Date().toISOString(),
        };

        // 设置新状态
        instance.status = status;
        instance.approvalHistory.push(approvalRecord);

        // 如果是拒绝或通过，且没有下一个节点，则流程结束
        if (status == 3) {
            // 拒绝：流程结束
            instance.currentNodeId = null;
            instance.currentApproverId = null;
        } else {
            // 通过：查找下一个节点
            const nextNodeInfo = this.findNextNode(graphData, currentNodeId);
            if (nextNodeInfo) {
                // 有下一个审批节点
                instance.currentNodeId = nextNodeInfo.id;
                instance.currentApproverId = nextNodeInfo.assignee;
            } else {
                // 无下一个节点 流程结束（通过）
                instance.currentNodeId = null;
                instance.currentApproverId = null;
            }
        }
        // 保存更新
        return await this.instanceRepo.save(instance);
    }

    // 辅助函数：根据当前节点 ID，找到下一个审批节点（rect）并返回其信息
    private findNextNode(graphData: any, currentId: string): { id: string; assignee: number } | null {
        const edges = graphData.edges || [];
        const nodes = graphData.nodes || [];

        // 找出当前节点发出的边
        const outgoingEdge = edges.find(edge => edge.sourceNodeId === currentId);
        if (!outgoingEdge) return null;

        const targetId = outgoingEdge.targetNodeId;
        const nextNode = nodes.find(node => node.id === targetId);

        if (!nextNode || nextNode.type !== 'rect') {
            return null; // 下一个不是审批节点，流程结束
        }
        const assignee = nextNode.properties?.assignee;
        return {
            id: nextNode.id,
            assignee,
        };
    }
}
