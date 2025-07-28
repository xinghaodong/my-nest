import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { OrgManagementService } from './org-management.service';
import { CreateOrgManagementDto } from './dto/create-org-management.dto';
import { UpdateOrgManagementDto } from './dto/update-org-management.dto';

@Controller('orgManagement')
export class OrgManagementController {
    constructor(private readonly orgManagementService: OrgManagementService) {}

    @Post('add')
    create(@Body() createOrgManagementDto: CreateOrgManagementDto) {
        return this.orgManagementService.create(createOrgManagementDto);
    }

    // 修改
    @Post('update')
    update(@Body('organid') organid: number, @Body() updateOrgManagementDto: UpdateOrgManagementDto) {
        return this.orgManagementService.update(organid, updateOrgManagementDto);
    }

    @Get()
    findAll() {
        return this.orgManagementService.findAll();
    }

    // 详情
    @Get('detail')
    findOneById(@Query('id') id: number) {
        return this.orgManagementService.findOneById(id);
    }

    // 删除
    @Post('delete')
    remove(@Body('id') id: number) {
        return this.orgManagementService.remove(id);
    }
}
