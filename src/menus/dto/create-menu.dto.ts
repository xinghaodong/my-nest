import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class CreateMenuDto {
    id: number;

    @IsString()
    @IsNotEmpty({ message: '菜单名称不能为空' })
    name: string;

    @IsString()
    @IsOptional()
    url?: string;

    @IsOptional()
    @Transform(({ value }) => {
        // 将空字符串转为 null，其他值保持原样
        if (value === '') return null;
        if (value === 0) return null;
        return value;
    })
    @ValidateIf(obj => obj.parentId !== null) // 仅当 parentId 不为 null 时验证
    parentId?: number | null;

    @IsOptional()
    @IsString()
    component?: string;

    @IsOptional()
    @IsString()
    icon?: string;

    @IsOptional()
    @IsString()
    keepalive?: string;

    @IsOptional()
    @IsString()
    vuepage?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    sorts: number;

    // 资源编码
    @IsString()
    @IsNotEmpty({ message: '资源编码不能为空' })
    code: string;
}
