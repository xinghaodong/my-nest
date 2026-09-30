// src/dtos/create-workflow.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateLogicFlowDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    status?: string;

    @IsNumber()
    @IsOptional()
    formId?: number;

    @IsString()
    @IsOptional()
    edgeType?: string;

    @IsNotEmpty()
    graphData: Record<string, any>;
}
