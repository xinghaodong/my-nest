import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { LogicFlowService } from './logic-flow.service';
import { CreateLogicFlowDto } from './dto/create-logic-flow.dto';
import { UpdateLogicFlowDto } from './dto/update-logic-flow.dto';
import { LogicFlow } from './entities/logic-flow.entity';

@Controller('logic-flow')
export class LogicFlowController {
    constructor(private readonly logicFlowService: LogicFlowService) {}

    @Post('add')
    async create(@Body() createLogicFlowDto: CreateLogicFlowDto): Promise<LogicFlow> {
        return await this.logicFlowService.create(createLogicFlowDto);
    }

    @Get('find')
    findAll(@Query('page') page: number, @Query('pageSize') pageSize: number) {
        return this.logicFlowService.findAll(page, pageSize);
    }

    @Get('detail')
    findOne(@Query('id') id: string) {
        return this.logicFlowService.findOne(+id);
    }

    @Post('update')
    update(@Body('id') id: number, @Body() createLogicFlowDto: CreateLogicFlowDto) {
        return this.logicFlowService.update(id, createLogicFlowDto);
    }

    @Post('remove')
    remove(@Body('id') id: number) {
        return this.logicFlowService.remove(+id);
    }
}
