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

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.logicFlowService.findOne(+id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateLogicFlowDto: UpdateLogicFlowDto) {
        return this.logicFlowService.update(+id, updateLogicFlowDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.logicFlowService.remove(+id);
    }
}
