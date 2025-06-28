import { PartialType } from '@nestjs/mapped-types';
import { CreateCesiumDto } from './create-cesium.dto';

export class UpdateCesiumDto extends PartialType(CreateCesiumDto) {}
