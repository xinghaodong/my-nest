import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { FormDesignService } from './form-design.service';
import { CreateFormDesignDto } from './dto/create-form-design.dto';
import { UpdateFormDesignDto } from './dto/update-form-design.dto';

@Controller('form-design')
export class FormDesignController {
    constructor(private readonly formDesignService: FormDesignService) {}

    @Post('add')
    create(@Body() createFormDesignDto: CreateFormDesignDto) {
        return this.formDesignService.create(createFormDesignDto);
    }

    @Get('find')
    findAll(@Query('page') page: number, @Query('pageSize') pageSize: number) {
        return this.formDesignService.findAll(page, pageSize);
    }

    @Get('detail')
    findOne(@Query('id') id: number) {
        return this.formDesignService.findOne(+id);
    }

    @Post('remove')
    remove(@Body('id') id: number) {
        return this.formDesignService.remove(+id);
    }

    // 修改状态
    @Post('updateStatus')
    updateStatus(@Body('id') id: number, @Body('status') status: string) {
        return this.formDesignService.updateStatus(+id, status);
    }
}
