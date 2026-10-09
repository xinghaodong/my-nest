// src/dtos/create-workflow.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateLogicFlowDto {
    @IsString({ message: '流程模板名称必须为字符串' })
    @IsNotEmpty({ message: '流程模板名称不能为空' })
    name: string;

    @IsString({ message: '描述信息必须为字符串' })
    @IsOptional()
    description?: string;

    @IsString({ message: '状态必须为字符串' })
    @IsOptional()
    status?: string;

    @IsNumber({}, { message: '关联表单ID必须为数字' })
    @IsOptional()
    formId?: number;

    @IsString({ message: '连线风格类型必须为字符串' })
    @IsOptional()
    edgeType?: string;

    @IsNotEmpty({ message: '流程图画布数据(graphData)不能为空' })
    graphData: Record<string, any>;
}
