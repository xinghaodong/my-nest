import { HttpException, Injectable } from '@nestjs/common';
import { CreateLogicFlowDto } from './dto/create-logic-flow.dto';
import { UpdateLogicFlowDto } from './dto/update-logic-flow.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { LogicFlow } from './entities/logic-flow.entity';
import { Repository } from 'typeorm';

@Injectable()
export class LogicFlowService {
    constructor(
        @InjectRepository(LogicFlow)
        private logicFlowRepository: Repository<LogicFlow>,
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
}
