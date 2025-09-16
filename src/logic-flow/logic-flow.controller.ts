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

    // 保存发起的审批流程
    @Post('startWorkflow')
    startWorkflow(@Body() body: { formId: number; formData: Record<string, any>; userId?: number }) {
        const { formId, formData, userId } = body;
        if (!formId || !formData) throw new BadRequestException('表单 ID 和数据不能为空');
        return this.logicFlowService.startWorkflow(formId, formData, userId);
    }

    // 获取自己的审批列表(查看自己发起的流程记录)
    @Get('getMyInstances')
    getMyInstances(@Query('userId') userId: number, @Query('page') page: number, @Query('pageSize') pageSize: number) {
        return this.logicFlowService.getMyInstances(userId, page, pageSize);
    }

    // 我的待办任务列表
    @Get('getMyTodoInstances')
    getMyTodoInstances(@Query('userId') userId: number, @Query('page') page: number, @Query('pageSize') pageSize: number) {
        return this.logicFlowService.getMyTodoInstances(userId, page, pageSize);
    }

    // 处理审批
    /***
     * @param id: 审批实例 ID
     * @param userId: 审批人 ID
     * @param status: 审批状态
     * @param comment: 审批意见
     */
    @Post('approve')
    approve(@Body() body: { id: number; userId: number; status: string; comment?: string }) {
        const { id, userId, status, comment } = body;
        return this.logicFlowService.approve(id, userId, status, comment);
    }

    /**
     * 查询审批历史审批记录
     * @param id: 审批实例 ID
     */
    @Get('getApprovalHistory')
    getApprovalHistory(@Query('id') id: string) {
        console.log('getApprovalHistory', id);
        return this.logicFlowService.getApprovalHistory(+id);
    }
}
