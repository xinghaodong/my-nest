import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateFundEstimateDto } from './dto/create-fund-estimate.dto';
import { UpdateFundEstimateDto } from './dto/update-fund-estimate.dto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FundEstimate } from './entities/fund-estimate.entity';

@Injectable()
export class FundEstimateService {
    constructor(
        @InjectRepository(FundEstimate)
        private fundEstimateRepository: Repository<FundEstimate>,
    ) {}
    // 检索基金
    async getFundSearch(key: string): Promise<any> {
        const res = await axios.get(`https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${key}`);
        if (res.data.Datas.length > 0) {
            return res.data;
        }
        return '未找到该基金';
    }
    // 创建基金
    async create(createFundEstimateDto: CreateFundEstimateDto) {
        // 保存入库
        const data = this.fundEstimateRepository.create(createFundEstimateDto);
        return await this.fundEstimateRepository.save(data);
    }

    async createBatch(dtos: CreateFundEstimateDto[]) {
        if (dtos.length === 0) {
            return [];
        }

        // 方式一：使用 save（自动处理 ID、时间戳等，但较慢）
        console.log('开始批量创建基金', dtos);
        const entities = dtos.map(dto => this.fundEstimateRepository.create(dto));
        return await this.fundEstimateRepository.save(entities, { chunk: 100 }); // 分块避免内存溢出
        // 方式二：使用 insert（更快，但不触发监听器，且返回不带 ID）
        // const result = await this.fundEstimateRepository.insert(dtos);
        // return result; // 注意：insert 返回的是 InsertResult，不是实体数组
    }

    //qdata
    async findAll() {
        // 查询全部的数据
        const qdata = await this.fundEstimateRepository.find();
        console.log('qdata', qdata);
        // 去重（可选）
        const uniqueIds = [...new Set(qdata)];
        console.log('去重后的数据', uniqueIds);
        // 并发调用 findOne
        const results = await Promise.allSettled(uniqueIds.map(item => this.findOne(item.code)));
        // const results = [];
        // 格式化结果：成功返回数据，失败返回错误信息
        return results.map((result, index) => {
            const item = uniqueIds[index];
            // const rawName = result.value.rawName;
            if (result.status === 'fulfilled') {
                return {
                    id: item.id,
                    success: true,
                    data: result.value,
                    fundChangePct: result.value[index].fundChangePct,
                    name: item.name,
                };
            } else {
                console.error(`基金 ${item.id} 查询失败:`, result.reason?.message || result.reason);
                return {
                    id: item.id,
                    name: item.name,
                    success: false,
                    error: result.reason?.message || '服务异常',
                    fundChangePct: '比对失败可能包含了除了美股、港股、A股的基金',
                    data: null,
                };
            }
        });
    }

    // 查询某一基金的持仓
    async findOne(id: any) {
        console.log(id, 'id');
        // console.log(id, 'id');
        // id 基金编号，topline 显示基金持有多少股票，
        const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${id}&topline=100&year=&month=`;
        try {
            const res = await axios.get(url);

            const $ = cheerio.load(res.data);
            // console.log($('#gpdmList').text().split(','), 'cheerio');
            let codeList = $('#gpdmList').text().split(',');
            // 删除掉 codeList 的最后一项
            console.log(codeList, 'codeList');
            codeList.pop();

            // 构建 rawCode -> fullCode 映射
            const codeMap = new Map<string, string>();
            codeList.forEach(fullCode => {
                const [prefix, symbol] = fullCode.split('.');
                if (symbol) {
                    codeMap.set(symbol, fullCode);
                }
            });

            // 尝试定位包含“证券代码 / 占净值比例”的表格
            let table = $('table')
                .filter((i, el) => {
                    const txt = $(el).text();
                    return txt.includes('股票代码') || txt.includes('占基金净值比例') || txt.includes('占净值比例');
                })
                .first();
            const headers: string[] = [];
            const datas: Array<{ rawName: string; codeName: string; rawWeight: string; weightPct: number }> = [];
            // 读取表头以确定列索引
            table.find('thead tr th').each((i, th) => {
                headers.push($(th).text().trim());
                return; // 显式返回 void，防止类型推断为 number
            });

            const rows = table.find('tbody tr');
            rows.each((i, tr) => {
                const cols = $(tr)
                    .find('td')
                    .map((i, td) => $(td).text().trim())
                    .get();
                if (!cols || !cols.length) return;
                // 尝试找到证券代码/简称/占比的列
                const headerText = headers.join('|').toLowerCase();
                // console.log(headerText, 'headerText', headers);
                const rawCode = cols[0] || '';
                const rawName = cols[1] || '';
                let weightIdx = headerText.indexOf('占净值') >= 0 ? headers.findIndex(h => h.includes('占净值')) : headers.findIndex(h => h.includes('占净值比例'));

                if (weightIdx < 0) weightIdx = cols.length - 1;
                const rawWeight = cols[weightIdx] || '';
                // 解析 weight（可能带 %）
                const weightPct = parseFloat((rawWeight || '').replace('%', '').replace(/,/g, '')) || 0;
                // console.log(weightPct, 'weightPct', rawName);
                datas.push({
                    codeName: rawCode,
                    rawName: rawName,
                    rawWeight: rawWeight,
                    weightPct: weightPct,
                });
            });
            let parsed = codeList.map((item, index) => {
                // console.log(item, 'item');
                codeList.push(item);
                const [marketPrefix, symbol] = item.split('.');
                let market: string;
                if (!marketPrefix || !symbol) {
                    market = 'INVALID'; // 格式错误，如无 '.' 分隔
                } else if (marketPrefix === '105' || marketPrefix === '106') {
                    market = 'US'; // 美股（含中概股）
                } else if (marketPrefix === '116') {
                    market = 'HK'; // 港股
                } else if (/^[013]/.test(marketPrefix)) {
                    // A股常见前缀：0（深市主板/创业板）、6（沪市）— 但天天基金A股通常无前缀或用0/1/3
                    // 注意：天天基金中A股代码可能直接是 '000001'，无前缀，此时 marketPrefix = '000001'
                    // 所以这里更安全的做法是判断 symbol 长度和数字特征
                    market = 'CN';
                } else {
                    market = 'OTHER'; // 未知市场（如债券、基金、新加坡、日韩欧洲股等）
                }
                return {
                    symbol,
                    market,
                    code: item,
                    ...datas[index],
                    fundChangePct: '',
                };
            });

            // console.log(parsed.length, 'parsed', rows.length);
            // console.log(parsed.length, 'parsed');
            // console.log(rows.length);
            // console.log(parsed, 'parsed');
            if (parsed.length != rows.length) {
                throw new BadRequestException('比对失败');
            }
            // console.log(parsed, 'parsed');
            // 便利 parsed 提取出拼接所有的code 字段为字符串
            const codes = parsed.map(item => item.code).join(',');
            const stockInfo = await this.getStockInfo(codes);
            parsed = parsed.map((item, index) => {
                return {
                    ...item,
                    ...stockInfo.diff[index],
                };
            });
            // 删除parsed后边9 项
            // parsed = parsed.slice(0, -9);
            // console.log(parsed, 'parsed');
            // -----------------------------
            //  计算基金整体涨跌幅（加权平均）
            // -----------------------------
            // weightPct 是占净值比例9.82 f3是涨跌幅 220 需要 *0.01
            const totalWeight = parsed.reduce((sum, item) => sum + (item.weightPct || 0), 0);
            const weightedSum = parsed.reduce((sum, item) => {
                const weight = item.weightPct || 0; // 9.82
                const changePct = ((item as any).f3 || 0) / 100; // 220 -> 2.20
                return sum + weight * changePct; // 9.82 * 2.2 = 21.604
            }, 0);

            // 加权平均 0.07是汇率先写死
            const fundChangePct = (weightedSum / totalWeight).toFixed(2);
            console.log(fundChangePct, 'fundChangePct', weightedSum, totalWeight);
            // console.log(parsed, 'parsed', codes);
            // console.log(stockInfo, 'stockInfo');
            // return stockInfo;
            parsed = parsed.map(item => {
                return {
                    ...item,
                    fundChangePct,
                };
            });
            return parsed;
        } catch (error) {
            console.log(error);
            throw error;
        }
    }
    // 根据 查询出来的基金codes 集合获取股票信息
    async getStockInfo(codes: string) {
        const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f2,f3,f12,f14,f9&secids=${codes}`;

        try {
            const res = await axios.get(url);

            // console.log(res.data, 'res.data');
            // console.log(res.data.data, 'res.data.data');
            return res.data.data;
        } catch (error) {
            throw new BadRequestException('获取股票信息失败');
        }
    }

    update(id: number, updateFundEstimateDto: UpdateFundEstimateDto) {
        return `This action updates a #${id} fundEstimate`;
    }

    async remove(id: number) {
        const data = await this.fundEstimateRepository.findOneBy({ id: id });
        if (!data) {
            throw new BadRequestException('未找到');
        }
        await this.fundEstimateRepository.delete(id);
    }
}
