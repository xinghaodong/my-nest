import { BadRequestException, HttpException, Injectable, Query } from '@nestjs/common';
import { CreateFormDesignDto } from './dto/create-form-design.dto';
import { UpdateFormDesignDto } from './dto/update-form-design.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { FormDesign } from './entities/form-design.entity';
import { Repository } from 'typeorm';
import { cloneDeep } from 'lodash';

@Injectable()
export class FormDesignService {
    constructor(
        @InjectRepository(FormDesign)
        private logicFlowRepository: Repository<FormDesign>,
    ) {}

    private cleanSchema(schema: any[]): any[] {
        return schema.map(item => {
            if (item && typeof item === 'object') {
                if (item.props) {
                    item.props = this.cleanObject(item.props);
                }
                if (item.props?.columns) {
                    item.props.columns = item.props.columns.map((col: any) => {
                        if (col.list) {
                            col.list = this.cleanSchema(col.list);
                        }
                        return this.cleanObject(col);
                    });
                }
                return this.cleanObject(item);
            }
            return item;
        });
    }

    private cleanObject(obj: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};
        for (const key in obj) {
            if (obj[key] !== undefined && typeof obj[key] !== 'function') {
                result[key] = obj[key];
            }
        }
        return result;
    }
    async create(createFormDesignDto: CreateFormDesignDto): Promise<FormDesign> {
        const formDesign = this.logicFlowRepository.create(createFormDesignDto);
        return await this.logicFlowRepository.save(formDesign);
    }

    async findAll(page?: number, pageSize: number = 10): Promise<{ data: FormDesign[]; total: number }> {
        const [data, total] = await this.logicFlowRepository.findAndCount({
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return { data: data, total };
    }

    async findAllNoPage(status?: string): Promise<FormDesign[]> {
        const where: any = {}; // 动态查询条件
        if (status) where.status = status;
        return await this.logicFlowRepository.find({
            where,
        });
    }

    async findOne(id: number): Promise<FormDesign> {
        const formDesign = await this.logicFlowRepository.findOneBy({ id });
        return formDesign;
    }

    update(id: number, updateFormDesignDto: UpdateFormDesignDto) {
        return `This action updates a #${id} formDesign`;
    }

    // 修改状态
    async updateStatus(id: number, status: string) {
        const formDesign = await this.logicFlowRepository.findOneBy({ id });
        if (!formDesign) {
            throw new HttpException('未找到表单设计', 404);
        }
        formDesign.status = status;
        return await this.logicFlowRepository.save(formDesign);
    }

    async remove(id: number) {
        // 根据id 查询是否存在，并且是启用状态的时候不能删除
        const formDesign = await this.logicFlowRepository.findOneBy({ id });
        if (!formDesign) {
            throw new BadRequestException('未找到表单设计');
        }
        if (formDesign.status == '1') {
            throw new BadRequestException('启用状态的表单不能删除');
        }
        await this.logicFlowRepository.delete(id);
        // if (result.affected === 0) {
        //     throw new HttpException('没找到流程', 404);
        // }
    }
}
