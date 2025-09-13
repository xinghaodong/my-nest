import { Module } from '@nestjs/common';
import { LogicFlowService } from './logic-flow.service';
import { LogicFlowController } from './logic-flow.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogicFlow } from './entities/logic-flow.entity';
import { ApprovalInstance } from './entities/approval-instance.entity';
import { FormDesign } from '../form-design/entities/form-design.entity';

@Module({
    imports: [TypeOrmModule.forFeature([LogicFlow,ApprovalInstance,FormDesign])],
    controllers: [LogicFlowController],
    providers: [LogicFlowService],
    exports: [LogicFlowService],
})
export class LogicFlowModule {}
