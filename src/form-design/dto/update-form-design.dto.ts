import { PartialType } from '@nestjs/mapped-types';
import { CreateFormDesignDto } from './create-form-design.dto';

export class UpdateFormDesignDto extends PartialType(CreateFormDesignDto) {}
