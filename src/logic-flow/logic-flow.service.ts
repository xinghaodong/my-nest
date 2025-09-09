import { Injectable } from '@nestjs/common';
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

    findOne(id: number) {
        return `This action returns a #${id} logicFlow`;
    }

    update(id: number, updateLogicFlowDto: UpdateLogicFlowDto) {
        return `This action updates a #${id} logicFlow`;
    }

    remove(id: number) {
        return `This action removes a #${id} logicFlow`;
    }
}
