import { PartialType } from '@nestjs/mapped-types';
import { CreateLogicFlowDto } from './create-logic-flow.dto';

export class UpdateLogicFlowDto extends PartialType(CreateLogicFlowDto) {}
