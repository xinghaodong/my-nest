// src/common/services/base.service.ts
import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto, PageResult } from '../dto/pagination-query.dto';

export interface QueryFieldOptions<T> {
    /** 实体在 QueryBuilder 中的别名，未提供时默认使用实体的 targetName 小写或 'entity' */
    alias?: string;

    /** 模糊匹配字段 (执行 column LIKE :val) */
    likeFields?: (keyof T | string)[];

    /** 精确匹配字段 (执行 column = :val) */
    exactFields?: (keyof T | string)[];

    /**
     * IN 多选/集合过滤字段
     * 支持数组形式：['status', 'roles.id']（直接按字段名或取最右侧键作为 queryDto 属性名）
     * 或对象映射形式：{ 'roles.id': 'roleIds' }（将 queryDto.roleIds 作用于 roles.id 列）
     */
    inFields?: (keyof T | string)[] | Record<string, string>;

    /** 全局模糊搜索（queryDto.keyword）作用的字段列表，未指定时默认使用 likeFields */
    searchFields?: (keyof T | string)[];

    /** 范围查询对应的时间字段，默认 'created_at'，有 startTime/endTime 时生效 */
    dateField?: keyof T | string;

    /** 默认排序规则，未指定时默认为 { [`${alias}.id`]: 'DESC' } */
    defaultOrder?: Record<string, 'ASC' | 'DESC'>;
}

/**
 * 通用企业级高级查询与分页基类服务
 * 封装通用分页计算、全局模糊搜索、多字段精确匹配、IN多选过滤及时间范围检索
 */
export abstract class BaseService<T extends ObjectLiteral> {
    constructor(protected readonly repository: Repository<T>) {}

    /**
     * 通用分页与高级查询引擎核心方法
     * @param queryDto 查询入参对象 (支持 page, pageSize, keyword, startTime, endTime 及模块扩展参数)
     * @param options 字段映射规则配置 (likeFields, exactFields, inFields, dateField 等)
     * @param customBuilderHook 自定义 QueryBuilder 构建钩子 (支持子类做复杂 LeftJoin、Select 或特定权限范围控制)
     */
    async findPage<Q extends PaginationQueryDto>(
        queryDto: Q = {} as Q,
        options: QueryFieldOptions<T> = {},
        customBuilderHook?: (qb: SelectQueryBuilder<T>) => void | Promise<void>,
    ): Promise<PageResult<T>> {
        // 1. 初始化别名与 QueryBuilder
        const defaultAlias =
            typeof this.repository.metadata?.targetName === 'string'
                ? this.repository.metadata.targetName.toLowerCase()
                : 'entity';
        const alias = options.alias || defaultAlias;
        const qb = this.repository.createQueryBuilder(alias);

        // 2. 执行自定义钩子 (先挂载 leftJoin 等关联关系与投影列)
        if (customBuilderHook) {
            await customBuilderHook(qb);
        }

        // 3. 全局关键字 keyword 模糊检索 (多字段 OR 连接)
        const keyword = queryDto.keyword?.trim();
        const searchFields = options.searchFields || options.likeFields || [];
        if (keyword && searchFields.length > 0) {
            const orConditions = searchFields.map(field => {
                const colName = String(field).includes('.') ? String(field) : `${alias}.${String(field)}`;
                return `${colName} LIKE :keyword`;
            });
            qb.andWhere(`(${orConditions.join(' OR ')})`, { keyword: `%${keyword}%` });
        }

        // 4. 独立字段模糊匹配 (likeFields)
        if (options.likeFields) {
            for (const field of options.likeFields) {
                const fieldStr = String(field);
                const queryKey = fieldStr.includes('.') ? fieldStr.split('.').pop()! : fieldStr;
                const val = (queryDto as any)[queryKey];
                if (val !== undefined && val !== null && val !== '') {
                    const paramKey = `like_${queryKey}`;
                    const colName = fieldStr.includes('.') ? fieldStr : `${alias}.${fieldStr}`;
                    qb.andWhere(`${colName} LIKE :${paramKey}`, { [paramKey]: `%${String(val).trim()}%` });
                }
            }
        }

        // 5. 独立字段精确匹配 (exactFields)
        if (options.exactFields) {
            for (const field of options.exactFields) {
                const fieldStr = String(field);
                const queryKey = fieldStr.includes('.') ? fieldStr.split('.').pop()! : fieldStr;
                const val = (queryDto as any)[queryKey];
                if (val !== undefined && val !== null && val !== '') {
                    const paramKey = `exact_${queryKey}`;
                    const colName = fieldStr.includes('.') ? fieldStr : `${alias}.${fieldStr}`;
                    qb.andWhere(`${colName} = :${paramKey}`, { [paramKey]: val });
                }
            }
        }

        // 6. IN 多选/集合范围匹配 (inFields)
        if (options.inFields) {
            if (Array.isArray(options.inFields)) {
                for (const field of options.inFields) {
                    const fieldStr = String(field);
                    const queryKey = fieldStr.includes('.') ? fieldStr.split('.').pop()! : fieldStr;
                    this.applyInCondition(qb, queryDto, fieldStr, queryKey, alias);
                }
            } else {
                for (const [colName, queryKey] of Object.entries(options.inFields)) {
                    this.applyInCondition(qb, queryDto, colName, queryKey, alias);
                }
            }
        }

        // 7. 时间范围检索 (startTime / endTime)
        const dateField = options.dateField ? String(options.dateField) : 'created_at';
        const dateCol = dateField.includes('.') ? dateField : `${alias}.${dateField}`;
        if (queryDto.startTime) {
            qb.andWhere(`${dateCol} >= :startTime`, { startTime: queryDto.startTime });
        }
        if (queryDto.endTime) {
            qb.andWhere(`${dateCol} <= :endTime`, { endTime: queryDto.endTime });
        }

        // 8. 排序配置
        if (options.defaultOrder && Object.keys(options.defaultOrder).length > 0) {
            for (const [orderField, direction] of Object.entries(options.defaultOrder)) {
                const colName = orderField.includes('.') ? orderField : `${alias}.${orderField}`;
                qb.addOrderBy(colName, direction);
            }
        } else {
            qb.orderBy(`${alias}.id`, 'DESC');
        }

        // 9. 分页计算 (保留 skip((page-1)*pageSize).take(pageSize) 算法并做安全阈值兜底)
        const page = Math.max(1, Number(queryDto.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(queryDto.pageSize) || 10));
        const skip = (page - 1) * pageSize;
        qb.skip(skip).take(pageSize);

        // 10. 执行查询并统计
        let [data, total] = await qb.getManyAndCount();

        // 11. 实体对象序列化转换 (激活 @Exclude() 敏感信息隐藏与类型转换)
        if (this.repository.target && typeof this.repository.target === 'function') {
            data = plainToInstance(this.repository.target as any, data);
        }

        return {
            data,
            total,
            page,
            pageSize,
        };
    }

    /**
     * 内部辅助：处理 IN 条件拼装
     */
    private applyInCondition<Q>(
        qb: SelectQueryBuilder<T>,
        queryDto: Q,
        fieldStr: string,
        queryKey: string,
        alias: string,
    ) {
        let val = (queryDto as any)[queryKey];
        if (val === undefined || val === null || val === '') return;

        // 兼容逗号分割字符串形式，如 "1,2,3" => [1, 2, 3]
        if (typeof val === 'string') {
            val = val
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
        }
        if (!Array.isArray(val)) {
            val = [val];
        }

        if (val.length > 0) {
            const safeParam = `in_${queryKey.replace(/[^a-zA-Z0-9_]/g, '_')}`;
            const colName = fieldStr.includes('.') ? fieldStr : `${alias}.${fieldStr}`;
            qb.andWhere(`${colName} IN (:...${safeParam})`, { [safeParam]: val });
        }
    }
}
