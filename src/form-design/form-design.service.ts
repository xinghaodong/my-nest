import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { CreateFormDesignDto } from './dto/create-form-design.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { FormDesign } from './entities/form-design.entity';
import { Repository } from 'typeorm';
import { BaseService } from '../common/services/base.service';
import { PageResult } from '../common/dto/pagination-query.dto';
import { QueryFormDesignDto } from './dto/query-form-design.dto';

@Injectable()
export class FormDesignService extends BaseService<FormDesign> {
    constructor(
        @InjectRepository(FormDesign)
        private logicFlowRepository: Repository<FormDesign>,
    ) {
        super(logicFlowRepository);
    }

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

    /**
     * 分页多条件高级查询动态表单列表
     * 继承 BaseService 引擎，支持表单名称模糊检索、状态精确匹配及创建/更新时间区间检索
     */
    async findAll(query: QueryFormDesignDto = new QueryFormDesignDto()): Promise<PageResult<FormDesign>> {
        return this.findPage(query, {
            alias: 'form',
            likeFields: ['name'],
            exactFields: ['status'],
            dateFields: ['created_at', 'updated_at'],
        });
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

    async update(id: number, updateDto: any): Promise<FormDesign> {
        const formDesign = await this.logicFlowRepository.findOneBy({ id });
        if (!formDesign) {
            throw new HttpException('未找到表单设计', 404);
        }
        if (updateDto.name !== undefined) formDesign.name = updateDto.name;
        if (updateDto.description !== undefined) formDesign.description = updateDto.description;
        if (updateDto.schema !== undefined) formDesign.schema = updateDto.schema;
        if (updateDto.ui_config !== undefined) formDesign.ui_config = updateDto.ui_config;
        if (updateDto.status !== undefined) formDesign.status = String(updateDto.status);

        return await this.logicFlowRepository.save(formDesign);
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
