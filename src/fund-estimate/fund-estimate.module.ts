import { Module } from '@nestjs/common';
import { FundEstimateService } from './fund-estimate.service';
import { FundEstimateController } from './fund-estimate.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FundEstimate } from './entities/fund-estimate.entity';

@Module({
    imports: [TypeOrmModule.forFeature([FundEstimate])],
    controllers: [FundEstimateController],
    providers: [FundEstimateService],
})
export class FundEstimateModule {}
