import { Module } from '@nestjs/common';
import { MenusService } from './menus.service';
import { MenusController } from './menus.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Menu } from './entities/menu.entity';
import { AuthModule } from '../auth/auth.module';
import { InternalusersModule } from '../internalusers/internalusers.module';
import { RoleModule } from '../role/role.module';

@Module({
    imports: [TypeOrmModule.forFeature([Menu]), AuthModule, InternalusersModule, RoleModule],
    controllers: [MenusController],
    providers: [MenusService],
})
export class MenusModule {}
