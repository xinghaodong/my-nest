import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, MinLength, IsString, Matches, IsArray } from 'class-validator';
export class CreateCesiumDto {
    id: number;

    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    time: number;

    @IsNotEmpty()
    pointNum: number;

    @IsNotEmpty()
    status: number;

    @Transform(({ value }) => (value ? new Date(value).toLocaleString() : null))
    created_at?: Date;

    @Transform(({ value }) => (value ? new Date(value).toLocaleString() : null))
    updated_at?: Date;
}
