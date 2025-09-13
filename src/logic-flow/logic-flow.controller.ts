import { Controller, Get, Post, Body, Patch, Param, Delete, Query, BadRequestException } from '@nestjs/common';
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

    // 新增：启动审批流程
    @Post('startWorkflow')
    startWorkflow(@Body() body: { formId: number; formData: Record<string, any>; userId?: number }) {
        console.log('body', body.formId,body.formData,body.userId);
        const { formId, formData, userId } = body;
        console.log('formId', formId,formData,userId);
        if (!formId || !formData) throw new BadRequestException('表单 ID 和数据不能为空');
        return this.logicFlowService.startWorkflow(formId, formData, userId);
    }


    
}
