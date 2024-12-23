import { Transform, Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max, IsNumber, ValidateNested, IsEmail, MinLength, IsString, Matches } from 'class-validator';
import { IsNotEmpty } from 'class-validator';
import { FileList } from '../../filelist/entities/filelist.entity';
export class CreateInternaluserDto {
    id: number;
    @IsNotEmpty({ message: '账号不能为空' })
    @MinLength(3, {
        message: '账号太短了',
    })
    username: string;
    @IsNotEmpty({ message: '姓名不能为空' })
    name: string;
    @IsOptional()
    @IsString()
    @Matches(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: '邮箱格式不对' })
    email?: string;
    @IsOptional()
    age?: string;

    @Transform(({ value }) => (value ? new Date(value).toLocaleString() : null))
    updated_at?: Date;
    @Transform(({ value }) => (value ? new Date(value).toLocaleString() : null))
    created_at?: Date;
    @IsOptional()
    @Type(() => FileList)
    avatar?: FileList; // 现在 avatar 是一个对象
    @IsOptional()
    avatars?: number;

    // 使用 Transform 设置默认密码
    @Transform(({ value }) => value || '123456') // 设置默认密码
    @IsString()
    @IsOptional()
    password?: string;
}
