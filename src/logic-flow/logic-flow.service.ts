import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { CreateLogicFlowDto } from './dto/create-logic-flow.dto';
import { UpdateLogicFlowDto } from './dto/update-logic-flow.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { LogicFlow } from './entities/logic-flow.entity';
import { Repository } from 'typeorm';
import { FormDesign } from '../form-design/entities/form-design.entity';
import { ApprovalInstance } from './entities/approval-instance.entity';

@Injectable()
export class LogicFlowService {
    constructor(
        @InjectRepository(LogicFlow)
        private logicFlowRepository: Repository<LogicFlow>,
        @InjectRepository(FormDesign)
        private formRepo: Repository<FormDesign>,
        @InjectRepository(ApprovalInstance)
        private instanceRepo: Repository<ApprovalInstance>,
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
    async startWorkflow(formId: number, formData: Record<string, any>, userId: number = 45) {
        const form = await this.formRepo.findOne({ where: { id: formId } });
        if (!form) throw new BadRequestException('表单不存在');

        const workflow = await this.logicFlowRepository.findOne({ where: { formId } });
        if (!workflow) throw new BadRequestException('未找到关联的审批流程');

        const graphData = workflow.graphData;

        const startNode = (graphData.nodes || []).find(node => node.type === 'circle' && node.text?.value === '开始');
        if (!startNode) throw new BadRequestException('流程起始节点缺失');

        const title = `${form.name}申请 - ${new Date().toLocaleDateString()}`;
        const instance = this.instanceRepo.create({
            title,
            formData,
            status: 1,
            currentNodeId: startNode.id,
            applicantId: userId,
            approvalHistory: [],
            workflowId: workflow.id,
            formId: form.id,
        });
        console.log('instance', instance);
        await this.instanceRepo.save(instance);

        return { instanceId: instance.id, workflowName: workflow.name };
    }

    // 获取我的审批流程数据
    async getMyInstances(userId: number, page?: number, pageSize: number = 10): Promise<{ data: ApprovalInstance[]; total: number }> {
        const [data, total] = await this.instanceRepo.findAndCount({
            where: { applicantId: userId },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return { data: data, total };
    }
}
