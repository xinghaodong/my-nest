import { forwardRef, Module } from '@nestjs/common';
import { MenusService } from './menus.service';
import { MenusController } from './menus.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Menu } from './entities/menu.entity';
import { AuthModule } from '../auth/auth.module';
import { InternalusersModule } from '../internalusers/internalusers.module';
import { RoleModule } from '../role/role.module';

@Module({
    // 在里需要使用forwardRef 解决循环依赖问题
    imports: [forwardRef(() => AuthModule), TypeOrmModule.forFeature([Menu]), InternalusersModule, RoleModule],
    controllers: [MenusController],
    providers: [MenusService],
    exports: [MenusService],
})
export class MenusModule {}
