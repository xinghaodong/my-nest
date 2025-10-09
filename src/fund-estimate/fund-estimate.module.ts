import { Module } from '@nestjs/common';
import { FundEstimateService } from './fund-estimate.service';
import { FundEstimateController } from './fund-estimate.controller';

@Module({
  controllers: [FundEstimateController],
  providers: [FundEstimateService],
})
export class FundEstimateModule {}
