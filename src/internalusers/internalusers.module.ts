import { Module } from '@nestjs/common';
import { InternalusersService } from './internalusers.service';
import { InternalusersController } from './internalusers.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalUser } from './entities/internaluser.entity';
import { FilelistModule } from '../filelist/filelist.module';
import { Role } from 'src/role/entities/role.entity';

@Module({
    imports: [TypeOrmModule.forFeature([InternalUser, Role])],
    controllers: [InternalusersController],
    providers: [InternalusersService],
    exports: [InternalusersService],
})
export class InternalusersModule {}
