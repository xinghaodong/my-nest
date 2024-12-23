import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Menu } from 'src/menus/entities/menu.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Role, Menu])],
    controllers: [RoleController],
    providers: [RoleService],
})
export class RoleModule {}
