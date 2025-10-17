import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class CreateFundEstimateDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsString()
    code: string;

    datas?: Record<string, any>;
}

// 新增：批量创建 DTO
export class CreateFundEstimateBatchDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateFundEstimateDto) //  class-transformer
    items: CreateFundEstimateDto[];
}
