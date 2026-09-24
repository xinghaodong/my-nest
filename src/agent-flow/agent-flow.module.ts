import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentFlowService } from './agent-flow.service';
import { ApprovalInstance } from '../logic-flow/entities/approval-instance.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ApprovalInstance])],
    providers: [AgentFlowService],
    exports: [AgentFlowService],
})
export class AgentFlowModule {}
