// src/internalusers/dto/query-internaluser.dto.ts
import { IsOptional, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * 内部用户列表查询过滤 DTO
 * 继承通用分页基类，扩展用户特有模糊与精确过滤字段
 */
export class QueryInternaluserDto extends PaginationQueryDto {
    /** 账号模糊查询 */
    @IsOptional()
    @IsString()
    username?: string;

    /** 姓名模糊查询 */
    @IsOptional()
    @IsString()
    name?: string;

    /** 邮箱模糊查询 */
    @IsOptional()
    @IsString()
    email?: string;

    /** 所属机构 ID 精确匹配 */
    @IsOptional()
    @Type(() => Number)
    organid?: number;

    /** 角色筛选 (兼容前端传入 roleIds) */
    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value.map(v => Number(v)).filter(n => !isNaN(n));
        if (typeof value === 'string') {
            return value
                .split(',')
                .map(v => Number(v.trim()))
                .filter(n => !isNaN(n));
        }
        if (typeof value === 'number') return [value];
        return value;
    })
    roleIds?: number[];

    /** 角色筛选 (兼容前端直接传递 roles 属性) */
    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value.map(v => Number(v)).filter(n => !isNaN(n));
        if (typeof value === 'string') {
            return value
                .split(',')
                .map(v => Number(v.trim()))
                .filter(n => !isNaN(n));
        }
        if (typeof value === 'number') return [value];
        return value;
    })
    roles?: number[];
}
