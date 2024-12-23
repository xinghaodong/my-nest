import { Controller, Get, Post, Body, Query, Req, Res, HttpException, ParseIntPipe, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { InternalusersService } from './internalusers.service';
import { CreateInternaluserDto } from './dto/create-internaluser.dto';
import { UpdateInternaluserDto } from './dto/update-internaluser.dto';
import { InternalUser } from './entities/internaluser.entity';
import { JwtAuthGuard } from '../auth/jwt.auth.guard';

@Controller('internalusers')
export class InternalusersController {
    constructor(private readonly internalusersService: InternalusersService) {}
    // 查询用户
    // @UseGuards(JwtAuthGuard)
    @Get('find')
    async findAll(@Query('page') page: number = 1, @Query('pageSize') pageSize: number = 10, @Query('search') search: string) {
        return this.internalusersService.findAll(page, pageSize);
    }
    // 新增用户
    @Post('add')
    async create(@Body() createInternaluserDto: CreateInternaluserDto): Promise<InternalUser> {
        console.log(createInternaluserDto, 'createInternaluserDto');
        return this.internalusersService.create(createInternaluserDto);
    }
    // 删除用户
    @Post('delete')
    async remove(@Body('id', new ParseIntPipe()) id: number) {
        return this.internalusersService.remove(id);
    }
    // 更新用户
    @Post('update')
    update(@Body('id', new ParseIntPipe()) id: number, @Body() updateUserDto: UpdateInternaluserDto) {
        return this.internalusersService.update(id, updateUserDto);
    }
}
