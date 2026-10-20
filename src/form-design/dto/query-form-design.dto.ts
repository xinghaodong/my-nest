import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * 动态表单列表高级查询 DTO
 * 继承通用分页基类，支持 name 模糊查询、status 精确匹配及创建/更新时间区间检索
 */
export class QueryFormDesignDto extends PaginationQueryDto {
    /** 表单名称模糊查询 */
    @IsOptional()
    @IsString()
    name?: string;

    /** 状态 (0=草稿, 1=发布, 2=停用) */
    @IsOptional()
    @IsString()
    status?: string;
}
