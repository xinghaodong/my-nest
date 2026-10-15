import { IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';

export class CreateTaskDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    flightId?: string;

    @IsOptional()
    @IsIn(['cpu', 'gpu', 'auto'])
    engineMode?: string = 'auto';

    @IsOptional()
    @IsIn(['lowest', 'low', 'medium', 'high'])
    quality?: string = 'low'; // 默认低精度（极速预览模式）

    @IsOptional()
    withDem?: boolean = false; // 是否同时生成 DSM/DTM 高程模型
}
