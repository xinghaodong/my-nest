import { Controller, Get, Post, Body, Query, ParseIntPipe, ParseArrayPipe, Logger } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('role')
export class RoleController {
    private readonly logger = new Logger(RoleController.name);
    constructor(private readonly roleService: RoleService) {}

    @Post('create')
    create(@Body() createRoleDto: CreateRoleDto) {
        return this.roleService.create(createRoleDto);
    }

    @Post('update')
    update(@Body('id') id: number, @Body() updateRoleDto: UpdateRoleDto) {
        return this.roleService.update(id, updateRoleDto);
    }

    @Get('findAll')
    findAll() {
        return this.roleService.findAll();
    }

    @Post('remove')
    remove(@Body('id') id: string) {
        return this.roleService.remove(+id);
    }

    // 详情
    @Get('detail')
    detail(@Query('id') id: string) {
        return this.roleService.detail(+id);
    }

    // 角色分配菜单资源
    @Post('assignMenusToRole')
    // @Body('id', new ParseIntPipe()) id: number
    assignMenusToRole(@Body('id', new ParseIntPipe()) id: number, @Body('menuIds') menuIds: number[]) {
        return this.roleService.assignMenusToRole(id, menuIds);
    }

    // 获取角色权限
    @Get('getRoleMenus')
    getRoleMenus(@Query('id', new ParseIntPipe()) id: number) {
        return this.roleService.getRoleMenus(id);
    }
}
