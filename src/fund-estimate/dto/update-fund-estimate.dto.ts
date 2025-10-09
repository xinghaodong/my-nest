import { PartialType } from '@nestjs/mapped-types';
import { CreateFundEstimateDto } from './create-fund-estimate.dto';

export class UpdateFundEstimateDto extends PartialType(CreateFundEstimateDto) {}
