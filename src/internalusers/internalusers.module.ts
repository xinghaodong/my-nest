import { Module } from '@nestjs/common';
import { InternalusersService } from './internalusers.service';
import { InternalusersController } from './internalusers.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalUser } from './entities/internaluser.entity';
import { Role } from 'src/role/entities/role.entity';
import { OrgManagementModule } from '../systemSetting/org-management/org-management.module';

@Module({
    imports: [TypeOrmModule.forFeature([InternalUser, Role]), OrgManagementModule],
    controllers: [InternalusersController],
    providers: [InternalusersService],
    exports: [InternalusersService],
})
export class InternalusersModule {}
