import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Req } from '@nestjs/common';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Controller('menus')
export class MenusController {
    constructor(private readonly menusService: MenusService) {}

    @Post('addmenu')
    create(@Body() createMenuDto: CreateMenuDto) {
        return this.menusService.create(createMenuDto);
    }

    @Get()
    findAll(@Req() req: any) {
        return this.menusService.findAll(req);
    }

    // 更新
    @Post('/update')
    update(@Body('id', new ParseIntPipe()) id: number, @Body() updateMenuDto: UpdateMenuDto) {
        return this.menusService.update(id, updateMenuDto);
    }

    @Post('/deletemenu')
    remove(@Body('id', new ParseIntPipe()) id: number) {
        return this.menusService.remove(id);
    }

    // 详情
    @Get('/detail')
    findOne(@Query('id') id: number) {
        return this.menusService.detail(id);
    }

    // 更具父级ID查询 getMenusByPid
    @Get('/getMenusByPid')
    getMenusByPid(@Query('pid') pid: number | null) {
        return this.menusService.getMenusByPid(pid);
    }
}
