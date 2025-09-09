// src/dtos/create-workflow.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateLogicFlowDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsNotEmpty()
    graphData: Record<string, any>;
}
