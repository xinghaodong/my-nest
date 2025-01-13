import { Module } from '@nestjs/common';
import { ProcessApprovalService } from './process-approval.service';
import { ProcessApprovalController } from './process-approval.controller';
import { ProcessTemplate } from './entities/process-approval.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([ProcessTemplate])],
    controllers: [ProcessApprovalController],
    providers: [ProcessApprovalService],
})
export class ProcessApprovalModule {}
