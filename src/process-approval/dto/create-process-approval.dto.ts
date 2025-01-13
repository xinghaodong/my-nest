import { IsArray, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class NodeDto {
    @IsNotEmpty()
    @IsString()
    id: string;

    @IsNotEmpty()
    @IsString()
    type: string;

    @IsNotEmpty()
    @IsObject()
    position: {
        x: number;
        y: number;
    };

    @IsNotEmpty()
    @IsObject()
    data: {
        label: string;
    };

    @IsNotEmpty()
    initialized: boolean;
}

class EdgeDto {
    @IsNotEmpty()
    @IsString()
    id: string;

    @IsNotEmpty()
    @IsString()
    type: string;

    @IsNotEmpty()
    @IsString()
    source: string;

    @IsNotEmpty()
    @IsString()
    target: string;

    @IsOptional()
    @IsString()
    sourceHandle: string | null;

    @IsOptional()
    @IsString()
    targetHandle: string | null;

    @IsOptional()
    @IsObject()
    data: any;

    @IsOptional()
    @IsString()
    label: string;

    @IsNotEmpty()
    @IsNumber()
    sourceX: number;

    @IsNotEmpty()
    @IsNumber()
    sourceY: number;

    @IsNotEmpty()
    @IsNumber()
    targetX: number;

    @IsNotEmpty()
    @IsNumber()
    targetY: number;
}

export class CreateProcessApprovalDto {
    @IsNotEmpty()
    @IsString()
    name: string; // 流程名称

    @IsNotEmpty()
    @IsString()
    code: string; // 流程编码

    @IsNotEmpty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => NodeDto)
    nodes: NodeDto[]; // 节点数组

    @IsNotEmpty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EdgeDto)
    edges: EdgeDto[]; // 边数组

    @IsNotEmpty()
    @IsArray()
    position: [string, string]; // 画布位置

    @IsNotEmpty()
    @IsString()
    zoom: string; // 缩放比例
}
