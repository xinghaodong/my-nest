import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateFormDesignDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    schema: string;

    @IsOptional()
    ui_config?: Record<string, any>; // 直接接收 formConfig 对象

    @IsString()
    @IsNotEmpty()
    status?: string;
}
