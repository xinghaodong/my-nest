import { PartialType } from '@nestjs/mapped-types';
import { CreateProcessApprovalDto } from './create-process-approval.dto';

export class UpdateProcessApprovalDto extends PartialType(CreateProcessApprovalDto) {}
