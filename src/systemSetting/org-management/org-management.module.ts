import { Module } from '@nestjs/common';
import { OrgManagementService } from './org-management.service';
import { OrgManagementController } from './org-management.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgManagement } from './entities/org-management.entity';

@Module({
    imports: [TypeOrmModule.forFeature([OrgManagement])],
    controllers: [OrgManagementController],
    providers: [OrgManagementService],
})
export class OrgManagementModule {}
