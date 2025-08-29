import { IsNotEmpty } from 'class-validator';

export class videoDto {
    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    fps: number;
}
export class updateVideoDto {
    @IsNotEmpty()
    id: number;

    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    fps: number;
}
