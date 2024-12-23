import { Module } from '@nestjs/common';
import { InternalusersService } from './internalusers.service';
import { InternalusersController } from './internalusers.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalUser } from './entities/internaluser.entity';
import { FilelistModule } from '../filelist/filelist.module';

@Module({
    imports: [TypeOrmModule.forFeature([InternalUser])],
    controllers: [InternalusersController],
    providers: [InternalusersService],
    exports: [InternalusersService],
})
export class InternalusersModule {}
