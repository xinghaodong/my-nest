import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoController } from './video.controller';
import { VideoEntity } from './video.entity';
import { VideoService } from './video.service';

@Module({
    imports: [TypeOrmModule.forFeature([VideoEntity])],
    providers: [VideoService],
    controllers: [VideoController],
})
export class VideoModule {}
