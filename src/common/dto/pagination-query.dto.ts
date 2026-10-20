// src/common/dto/pagination-query.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';

/**
 * 通用分页与高级查询基准 DTO
 */
export class PaginationQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    pageSize?: number = 10;

    /** 全局模糊搜索通用关键字 */
    @IsOptional()
    @IsString()
    keyword?: string;

    /** 范围查询：开始时间 */
    @IsOptional()
    startTime?: string;

    /** 范围查询：结束时间 */
    @IsOptional()
    endTime?: string;
}

/**
 * 通用分页返回标准结构契约
 */
export interface PageResult<T> {
    data: T[];
    total: number;
    page?: number;
    pageSize?: number;
}
