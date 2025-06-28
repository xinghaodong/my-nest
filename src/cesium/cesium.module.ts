import { Module } from '@nestjs/common';
import { CesiumService } from './cesium.service';
import { CesiumController } from './cesium.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cesium } from './entities/cesium.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Cesium])],
    controllers: [CesiumController],
    providers: [CesiumService],
})
export class CesiumModule {}
