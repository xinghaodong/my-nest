import { PartialType } from '@nestjs/mapped-types';
import { CreateOrgManagementDto } from './create-org-management.dto';

export class UpdateOrgManagementDto extends PartialType(CreateOrgManagementDto) {}
