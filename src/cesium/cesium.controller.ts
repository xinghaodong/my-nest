import { Controller, Get, Post, Body, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { CesiumService } from './cesium.service';
import { CreateCesiumDto } from './dto/create-cesium.dto';
import { UpdateCesiumDto } from './dto/update-cesium.dto';

@Controller('cesium')
export class CesiumController {
    constructor(private readonly cesiumService: CesiumService) {}

    @Post('create')
    create(@Body() createCesiumDto: CreateCesiumDto) {
        return this.cesiumService.create(createCesiumDto);
    }

    @Get('list')
    findAll(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number) {
        return this.cesiumService.findAll(page, pageSize);
    }
    @Post('delete')
    update(@Body('id') id: number) {
        return this.cesiumService.remove(id);
    }

    // get 获取航线详情接口
    @Get('detail')
    async findOne(@Query('id') id: number) {
        return this.cesiumService.findOne(id);
    }
}
