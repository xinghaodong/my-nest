import { PartialType } from '@nestjs/mapped-types';
import { CreateInternaluserDto } from './create-internaluser.dto';

export class UpdateInternaluserDto extends PartialType(CreateInternaluserDto) {}
