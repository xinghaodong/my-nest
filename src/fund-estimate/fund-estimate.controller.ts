import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { FundEstimateService } from './fund-estimate.service';
import { CreateFundEstimateBatchDto, CreateFundEstimateDto } from './dto/create-fund-estimate.dto';
import { UpdateFundEstimateDto } from './dto/update-fund-estimate.dto';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('fund-estimate')
export class FundEstimateController {
    constructor(private readonly fundEstimateService: FundEstimateService) {}

    @Public()
    @Post()
    create(@Body() createFundEstimateDto: CreateFundEstimateDto) {
        return this.fundEstimateService.create(createFundEstimateDto);
    }

    // ：批量插入

    @Public()
    @Post('batch')
    createBatch(@Body() batchDto: CreateFundEstimateBatchDto) {
        return this.fundEstimateService.createBatch(batchDto.items);
    }

    // 检索基金
    @Public()
    @Get('search')
    async search(@Query('key') key: string) {
        console.log('key', key);
        return this.fundEstimateService.getFundSearch(key);
    }

    @Public()
    @Get()
    findAll() {
        // '017436', '017730'
        // ['017436', '017730', '539002', '016701'];
        // data = [
        //     {
        //         id: '017436',
        //         name: '华宝纳斯达克精选股票',
        //     },
        //     {
        //         id: '017730',
        //         name: '嘉实全球产业升级股票',
        //     },
        //     {
        //         id: '539002',
        //         name: '建信新兴市场混合',
        //     },
        //     {
        //         id: '016701',
        //         name: '银华海外数字经济量化选股混合',
        //     },
        // ];
        // ids = ['017436', '017730', '539002', '016701'];
        return this.fundEstimateService.findAll();
    }

    // 查询某一个基金的持仓
    @Get('detail')
    findOne(@Query('id') id: string) {
        return this.fundEstimateService.findOne(id);
    }

    // post 删除
    @Post('delete')
    remove(@Body('id') id: number) {
        return this.fundEstimateService.remove(id);
    }
}
