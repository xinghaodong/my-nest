import { Module } from '@nestjs/common';
import { LogicFlowService } from './logic-flow.service';
import { LogicFlowController } from './logic-flow.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogicFlow } from './entities/logic-flow.entity';

@Module({
    imports: [TypeOrmModule.forFeature([LogicFlow])],
    controllers: [LogicFlowController],
    providers: [LogicFlowService],
})
export class LogicFlowModule {}
