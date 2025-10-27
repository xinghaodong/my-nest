import { Controller, Get, Post, Body, Query, Req, ParseIntPipe } from '@nestjs/common';
import { InternalusersService } from './internalusers.service';
import { CreateInternaluserDto } from './dto/create-internaluser.dto';
import { UpdateInternaluserDto } from './dto/update-internaluser.dto';
import { InternalUser } from './entities/internaluser.entity';

@Controller('internalusers')
export class InternalusersController {
    constructor(private readonly internalusersService: InternalusersService) {}
    // 查询用户
    // @UseGuards(JwtAuthGuard)
    @Get('find')
    async findAll(@Query('page') page: number, @Query('pageSize') pageSize: number) {
        return this.internalusersService.findAll(page, pageSize);
    }

    // 查询全部用户不分页
    @Get('findAll')
    async findAllNoPage() {
        return this.internalusersService.findAllNoPage();
    }

    // 新增用户
    @Post('add')
    async create(@Body() createInternaluserDto: CreateInternaluserDto): Promise<InternalUser> {
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
    // 用户详情
    @Get('detail')
    findOneAll(@Query('id', new ParseIntPipe()) id: number) {
        return this.internalusersService.findOneAll(id);
    }
    // 修改用户主题
    @Post('updateTheme')
    updateTheme(@Body('id', new ParseIntPipe()) id: number, @Body('theme') theme: string) {
        return this.internalusersService.updateTheme(id, theme);
    }

    // 根据 token 获取用户信息
    @Get('getUserInfo')
    async getUserInfo(@Req() req: any) {
        const id = req.user.userId;
        return await this.internalusersService.findOneAllToken(id);
    }
}
