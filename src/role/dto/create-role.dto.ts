import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
    id: number;

    @IsString()
    @IsNotEmpty({ message: '角色名称不能为空' })
    name: string;

    @IsNumber()
    states: number;

    updated_at?: Date;

    created_at?: Date;

    // @IsArray()
    // @IsNumber({}, { each: true, message: '菜单ID必须为数字' }) // 验证数组中每个值为数字
    // @IsOptional() // 菜单字段非必填
    // menus?: number[]; // 菜单ID数组
}
