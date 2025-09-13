import { Module } from '@nestjs/common';
import { FormDesignService } from './form-design.service';
import { FormDesignController } from './form-design.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormDesign } from './entities/form-design.entity';

@Module({
    imports: [TypeOrmModule.forFeature([FormDesign])],
    controllers: [FormDesignController],
    providers: [FormDesignService],
    // exports: [FormDesignService],
})
export class FormDesignModule {}
