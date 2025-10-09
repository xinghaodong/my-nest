import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { FundEstimateService } from './fund-estimate.service';
import { CreateFundEstimateDto } from './dto/create-fund-estimate.dto';
import { UpdateFundEstimateDto } from './dto/update-fund-estimate.dto';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('fund-estimate')
export class FundEstimateController {
    constructor(private readonly fundEstimateService: FundEstimateService) {}

    @Post()
    create(@Body() createFundEstimateDto: CreateFundEstimateDto) {
        return this.fundEstimateService.create(createFundEstimateDto);
    }

    @Public()
    @Get()
    findAll() {
        return this.fundEstimateService.findAll();
    }

    // 查询某一个基金的持仓
    @Get('detail')
    findOne(@Query('id') id: string) {
        return this.fundEstimateService.findOne(id);
    }
}
