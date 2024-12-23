import { PartialType } from '@nestjs/mapped-types';
import { CreateFilelistDto } from './create-filelist.dto';

export class UpdateFilelistDto extends PartialType(CreateFilelistDto) {}
