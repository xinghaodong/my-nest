import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateOrgManagementDto {
    id: number;

    @IsString()
    @IsNotEmpty({ message: '菜单名称不能为空' })
    organame: string;

    @IsString()
    @IsNotEmpty({ message: '组织编码不能为空' })
    orgcode: string;

    @IsOptional()
    @Transform(({ value }) => {
        // 将空字符串转为 null，其他值保持原样
        if (value === '') return null;
        if (value === 0) return null;
        return value;
    })
    @ValidateIf(obj => obj.parentId !== null) // 仅当 parentId 不为 null 时验证
    parentId?: number | null;
}
