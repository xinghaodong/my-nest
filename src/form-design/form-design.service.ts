import { BadRequestException, HttpException, Injectable, OnModuleInit } from '@nestjs/common';
import { CreateFormDesignDto } from './dto/create-form-design.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { FormDesign } from './entities/form-design.entity';
import { Repository } from 'typeorm';

@Injectable()
export class FormDesignService implements OnModuleInit {
    constructor(
        @InjectRepository(FormDesign)
        private logicFlowRepository: Repository<FormDesign>,
    ) {}
    // 临时性 兼容旧版 Grid schema 脚本代码跑完之后需要删除
    async onModuleInit() {
        console.log('>>> [FormDesignService] 正在执行全量数据库表单 Schema 检查与迁移...');
        try {
            const allForms = await this.logicFlowRepository.find();
            for (const item of allForms) {
                if (!item.schema) continue;
                try {
                    const list = JSON.parse(item.schema);
                    if (!Array.isArray(list)) continue;
                    let hasChanged = false;

                    const walk = (items: any[]): any[] => {
                        return items.map(node => {
                            if (!node || typeof node !== 'object') return node;

                            // 1. 迁移旧版 Grid: 将 columns[i].list 转换为标准 slots
                            if (node.type === 'grid' && !node.slots && Array.isArray(node.props?.columns)) {
                                hasChanged = true;
                                const slots: Record<string, any[]> = {};
                                const cleanColumns = node.props.columns.map((col: any, index: number) => {
                                    const slotKey = `col_${index}`;
                                    slots[slotKey] = walk(col.list || []);
                                    return {
                                        span: col.span || 12,
                                        slot: slotKey,
                                    };
                                });
                                return {
                                    id: node.id,
                                    type: 'grid',
                                    component: node.component || 'el-row',
                                    props: {
                                        gutter: node.props.gutter || 20,
                                        columns: cleanColumns,
                                    },
                                    slots,
                                };
                            }

                            // 2. 补齐已存在 slots 但 columns 里遗漏 slot 键名的 Grid
                            if (node.type === 'grid' && node.slots && Array.isArray(node.props?.columns)) {
                                node.props.columns = node.props.columns.map((col: any, index: number) => {
                                    if (!col.slot) {
                                        hasChanged = true;
                                        return { ...col, slot: `col_${index}` };
                                    }
                                    return col;
                                });
                            }

                            if (node.slots && typeof node.slots === 'object') {
                                const newSlots: Record<string, any[]> = {};
                                for (const k in node.slots) {
                                    newSlots[k] = walk(node.slots[k] || []);
                                }
                                return { ...node, slots: newSlots };
                            }

                            return node;
                        });
                    };

                    const updated = walk(list);
                    if (hasChanged) {
                        item.schema = JSON.stringify(updated);
                        await this.logicFlowRepository.save(item);
                        console.log(`>>> [FormDesignService] 成功修复并升级数据库表单: ID=${item.id}, Name=${item.name}`);
                    }
                } catch (e) {
                    console.error(`解析表单 ID=${item.id} 异常:`, e);
                }
            }
        } catch (err) {
            console.error('>>> [FormDesignService] 迁移数据库异常:', err);
        }
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

    update(id: number) {
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
