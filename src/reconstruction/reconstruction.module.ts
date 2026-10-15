import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconstructionTask } from './entities/reconstruction-task.entity';
import { ReconstructionService } from './reconstruction.service';
import { ReconstructionController } from './reconstruction.controller';

@Module({
    imports: [TypeOrmModule.forFeature([ReconstructionTask])],
    controllers: [ReconstructionController],
    providers: [ReconstructionService],
    exports: [ReconstructionService],
})
export class ReconstructionModule {}
