import { Injectable } from '@nestjs/common';
import { CreateProcessApprovalDto } from './dto/create-process-approval.dto';
import { UpdateProcessApprovalDto } from './dto/update-process-approval.dto';
import { ProcessTemplate } from './entities/process-approval.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class ProcessApprovalService {
    constructor(
        @InjectRepository(ProcessTemplate)
        private readonly processTemplateRepository: Repository<ProcessTemplate>,
    ) {}
    create(createProcessApprovalDto: CreateProcessApprovalDto) {
        console.log(createProcessApprovalDto, '哈哈');

        const processTemplate = this.processTemplateRepository.create(createProcessApprovalDto);
        return this.processTemplateRepository.save(processTemplate);
    }

    async findAll(page: number = 1, pageSize: number = 10): Promise<{ data: ProcessTemplate[]; total: number }> {
        const [data, total] = await this.processTemplateRepository.findAndCount({
            skip: (page - 1) * pageSize, // 跳过的数据量
            take: pageSize, // 每页取出的数据量
        });

        return { data: data, total }; // 返回查询结果和总记录数
    }

    findOne(id: number) {
        return this.processTemplateRepository.findOneBy({ id: id });
    }

    update(id: number, updateProcessApprovalDto: UpdateProcessApprovalDto) {
        return `This action updates a #${id} processApproval`;
    }

    remove(id: number) {
        return `This action removes a #${id} processApproval`;
    }
}
