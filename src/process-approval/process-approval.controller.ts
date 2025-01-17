import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ProcessApprovalService } from './process-approval.service';
import { CreateProcessApprovalDto } from './dto/create-process-approval.dto';
import { UpdateProcessApprovalDto } from './dto/update-process-approval.dto';

@Controller('process-approval')
export class ProcessApprovalController {
    constructor(private readonly processApprovalService: ProcessApprovalService) {}

    @Post()
    async create(@Body() createProcessApprovalDto: CreateProcessApprovalDto) {
        return await this.processApprovalService.create(createProcessApprovalDto);
    }

    @Get()
    async findAll(@Query('page') page: number = 1, @Query('pageSize') pageSize: number = 10) {
        return await this.processApprovalService.findAll(page, pageSize);
    }

    @Get('detail')
    async findOne(@Query('id') id: number) {
        return await this.processApprovalService.findOne(id);
    }
}
