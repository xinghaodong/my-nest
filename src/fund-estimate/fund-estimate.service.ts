import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateFundEstimateDto } from './dto/create-fund-estimate.dto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FundEstimate } from './entities/fund-estimate.entity';

@Injectable()
export class FundEstimateService {
    private headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        Referer: 'https://quote.eastmoney.com/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'no-cache',
        connection: 'keep-alive',
        'Sec-Ch-Ua': '"Google Chrome";v="141", "Not/A)Brand";v="8", "Chromium";v="141"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        Cookie: 'st_nvi=sqTZk-g-VRnpQuprNKZ1y3bb4; qgqp_b_id=af5cce20eeaa6d564690e90f144c5289; nid=07da164c511bc9eb6784dd93043c48df; nid_create_time=1759980972277; gvi=qkQPi06hWa6NEFgq9B34f7c14; gvi_create_time=1759980972277; AUTH_FUND.EASTMONEY.COM_GSJZ=AUTH*TTJJ*TOKEN; st_si=93710146157032; st_asi=delete; EMFUND1=10-20%2010%3A42%3A48@%23%24%u5E7F%u53D1%u6E2F%u80A1%u521B%u65B0%u836FETF%u8054%u63A5%28QDII%29A@%23%24019670; EMFUND2=10-20%2010%3A42%3A47@%23%24%u4E1C%u8D22%u4E0A%u8BC150A@%23%24008240; EMFUND3=10-20%2010%3A42%3A48@%23%24%u5BCC%u56FD%u4E0A%u8BC1%u6307%u6570ETF%u8054%u63A5C@%23%24013286; EMFUND4=10-24%2018%3A21%3A02@%23%24%u5929%u5F18%u4E2D%u8BC1%u98DF%u54C1%u996E%u6599ETF@%23%24159736; EMFUND5=10-24%2018%3A15%3A33@%23%24%u6613%u65B9%u8FBE%u4E2D%u8BC1%u6D77%u5916%u4E92%u8054%u7F5150ETF%u8054%u63A5%28QDII%29A@%23%24006327; EMFUND6=10-27%2011%3A07%3A42@%23%24%u534E%u5B9D%u6D77%u5916%u79D1%u6280%u80A1%u7968%28QDII-LOF%29C@%23%24017204; EMFUND7=10-27%2011%3A20%3A41@%23%24%u4E2D%u6B27%u533B%u7597%u5065%u5EB7%u6DF7%u5408A@%23%24003095; EMFUND8=10-27%2016%3A37%3A23@%23%24%u6C38%u8D62%u79D1%u6280%u667A%u9009%u6DF7%u5408%u53D1%u8D77A@%23%24022364; EMFUND0=10-28%2009%3A32%3A42@%23%24%u62DB%u5546%u4E2D%u8BC1%u767D%u9152%u6307%u6570%28LOF%29A@%23%24161725; EMFUND9=10-28 09:39:20@#$%u534E%u5B9D%u7EB3%u65AF%u8FBE%u514B%u7CBE%u9009%u80A1%u7968%u53D1%u8D77%u5F0F%28QDII%29A@%23%24017436; st_pvi=70723012225516; st_sp=2025-10-09%2011%3A36%3A12; st_inirUrl=https%3A%2F%2Fchat.qwen.ai%2Fc%2F7f8dd940-74e6-48ab-873a-397bae1fdfbf; st_sn=8; st_psi=20251028094729670-112200305283-5653636181',
        host: 'push2.eastmoney.com',
        pragma: 'no-cache',
    };
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
        // console.log('开始批量创建基金', dtos);
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
        // console.log('qdata', qdata);
        // 去重（可选）
        const uniqueIds = [...new Set(qdata)];
        // console.log('去重后的数据', uniqueIds);
        // 并发调用 findOne
        const results = await Promise.allSettled(uniqueIds.map(item => this.findOne(item.code)));
        // console.log('结果', results);
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
                    fundChangePct: Array.isArray(result.value) && result.value.length > 0 ? result.value[0].fundChangePct || '0' : '0',
                    name: item.name,
                };
            } else {
                // console.error(`基金 ${item.id} 查询失败:`, result.reason?.message || result.reason);
                return {
                    id: item.id,
                    name: item.name,
                    success: false,
                    error: result.reason?.message || '服务异常.',
                    fundChangePct: '比对失败',
                    data: null,
                };
            }
        });
    }

    mergeArrays(arrayA: any[], arrayB: any[], key2: string, key: string) {
        // 构建一个以 symbol 为 key 的 map，便于快速查找
        const symbolMap = new Map();
        arrayA.forEach(item => {
            symbolMap.set(item[key2], item);
        });

        // 以 arrayB 为主进行合并
        const merged = arrayB.map(bItem => {
            const matchedA = symbolMap.get(bItem[key]);
            if (matchedA) {
                // 合并：以 A 的字段为主，但保留 B 的字段（比如 rawName 等其实一样，但以防万一）
                return { ...bItem, ...matchedA };
            } else {
                // 没有匹配项，保留 B 的内容，可选：补充缺失字段为 null/undefined
                return { ...bItem };
            }
        });
        // console.log('合并后的数据', merged);
        return merged;
    }

    // 查询某一基金的持仓
    async findOne(id: any) {
        // console.log(id, 'id');
        // console.log(id, 'id');
        // id 基金编号，topline 显示基金持有多少股票，
        const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${id}&topline=100&year=&month=`;
        try {
            const res = await axios.get(url);

            const $ = cheerio.load(res.data);
            // console.log($('#gpdmList').text().split(','), 'cheerio');
            const codeList = $('#gpdmList').text().split(',');
            // 删除掉 codeList 的最后一项
            // console.log(codeList, 'codeList');
            codeList.pop();

            // 构建 rawCode -> fullCode 映射
            const codeMap = new Map<string, string>();
            codeList.forEach(fullCode => {
                const [symbol] = fullCode.split('.');
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
            const headersTite: string[] = [];
            const datas = [];
            // 读取表头以确定列索引
            table.find('thead tr th').each((i, th) => {
                headersTite.push($(th).text().trim());
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
                const headerText = headersTite.join('|').toLowerCase();
                // console.log(headerText, 'headerText', headers);
                const rawCode = cols[0] || '';
                const rawName = cols[1] || '';
                const rawNames = cols[2] || '';
                // console.log(rawNames, 'rawNames');
                let weightIdx = headerText.indexOf('占净值') >= 0 ? headersTite.findIndex(h => h.includes('占净值')) : headersTite.findIndex(h => h.includes('占净值比例'));

                if (weightIdx < 0) weightIdx = cols.length - 1;
                const rawWeight = cols[weightIdx] || '';
                // 解析 weight（可能带 %）
                const weightPct = parseFloat((rawWeight || '').replace('%', '').replace(/,/g, '')) || 0;
                // console.log(weightPct, 'weightPct', rawName);
                datas.push({
                    codeName: rawCode,
                    rawName: rawName,
                    rawNames: rawNames,
                    rawWeight: rawWeight,
                    weightPct: weightPct,
                });
            });
            // console.log(datas, 'datas');
            let parsed = codeList.map(item => {
                // console.log(item, 'item');
                // codeList.push(item);
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
                    fundChangePct: '',
                };
            });
            //symbol
            // 合并两个数组
            parsed = this.mergeArrays(parsed, datas, 'symbol', 'rawName');
            const codes = parsed.map(item => item.code).join(',');
            const stockInfo = await this.getStockInfo(codes);
            // console.log(stockInfo, 'stockInfo');
            parsed = this.mergeArrays(stockInfo.diff, parsed, 'f12', 'rawName');
            // parsed = parsed.map((item, index) => {
            //     return {
            //         ...item,
            //         ...stockInfo.diff[index],
            //     };
            // });
            // console.log(parsed, 'parsed');
            // 删除parsed后边9 项
            // parsed = parsed.slice(0, -9);
            // console.log(parsed, 'parsed');
            // -----------------------------
            //  计算基金整体涨跌幅（加权平均）
            // -----------------------------
            // weightPct 是占净值比例9.82 f3是涨跌幅 220 需要 *0.01
            const totalWeight = parsed.reduce((sum, item) => sum + ((item as any).weightPct || 0), 0);
            const weightedSum = parsed.reduce((sum, item) => {
                const weight = (item as any).weightPct || 0; // 9.82
                const changePct = ((item as any).f3 || 0) / 100; // 220 -> 2.20
                return sum + weight * changePct; // 9.82 * 2.2 = 21.604
            }, 0);

            // 加权平均 0.07是汇率先写死
            const fundChangePct = (weightedSum / totalWeight).toFixed(2);
            // console.log(fundChangePct, 'fundChangePct', weightedSum, totalWeight);
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

    async getStockInfo(codes: string) {
        console.log(codes, 'codes');
        // const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f2,f3,f12,f14,f9&secids=${codes}`;
        const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
        const params = {
            fields: 'f2,f3,f12,f14,f9',
            secids: codes,
        };
        // console.log(url, 'url');

        try {
            // { params, headers: this.headers }
            const response = await axios.get(url, { params, headers: this.headers });
            return response.data.data;
        } catch (error) {
            console.error('请求错误！！:', error);
            if (axios.isAxiosError(error)) {
                console.error('Axios 错误:', error.message);
                console.error('状态码:', error.response?.status);
                console.error('响应数据:', error.response?.data);
            } else {
                console.error('未知错误:', error);
            }
        }
    }
    // 根据 查询出来的基金codes 集合获取股票信息
    // async getStockInfo(codes: string) {
    //     console.log(codes, 'codes');
    //     const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f2,f3,f12,f14,f9&secids=${codes}`;
    //     console.log(url, 'url');
    //     try {
    //         const res = await axios.get(url);

    //         // console.log(res.data, 'res.data');
    //         // console.log(res.data.data, 'res.data.data');
    //         return res.data.data;
    //     } catch {
    //         throw new BadRequestException('获取股票信息失败');
    //     }
    // }

    update(id: number) {
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
