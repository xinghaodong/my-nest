import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateFundEstimateDto } from './dto/create-fund-estimate.dto';
import { UpdateFundEstimateDto } from './dto/update-fund-estimate.dto';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class FundEstimateService {
    create(createFundEstimateDto: CreateFundEstimateDto) {
        return 'This action adds a new fundEstimate';
    }

    async findAll() {}

    // 查询某一基金的持仓
    async findOne(id: string) {
        console.log(id, 'id');
        // id 基金编号，topline 显示基金持有多少股票，
        const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${id}&topline=50&year=&month=`;
        try {
            const res = await axios.get(url);
            // 将所有 \u003c 等 unicode 转义恢复
            const decoded = res.data.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
            // 匹配 105.NVDA,105.MSFT,... 这一行
            const match = decoded.match(/(\d{3}\.[A-Z]+(?:,\d{3}\.[A-Z]+)+)/);
            if (!match) {
                return [];
            }
            const codeList = match[1].split(',');

            const $ = cheerio.load(res.data);
            // 尝试定位包含“证券代码 / 占净值比例”的表格
            let table = $('table')
                .filter((i, el) => {
                    const txt = $(el).text();
                    return txt.includes('证券代码') || txt.includes('占基金净值比例') || txt.includes('占净值比例');
                })
                .first();
            const headers: string[] = [];
            const datas: Array<{ rawName: string; rawWeight: string; weightPct: number }> = [];
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
                let nameIdx = headerText.indexOf('股票名称') >= 0 ? headers.findIndex(h => h.includes('股票名称')) : 0;
                let weightIdx = headerText.indexOf('占净值') >= 0 ? headers.findIndex(h => h.includes('占净值')) : headers.findIndex(h => h.includes('占净值比例'));

                // 如果索引无效，做 best-effort 赋值
                if (nameIdx < 0) nameIdx = 1;
                if (weightIdx < 0) weightIdx = cols.length - 1;
                const rawName = cols[nameIdx] || '';
                const rawWeight = cols[weightIdx] || '';
                // 解析 weight（可能带 %）
                const weightPct = parseFloat((rawWeight || '').replace('%', '').replace(/,/g, '')) || 0;
                // console.log(weightPct, 'weightPct', rawName);
                datas.push({
                    rawName: rawName,
                    rawWeight: rawWeight,
                    weightPct: weightPct,
                });
            });

            let parsed = codeList.map(item => {
                // console.log(item, 'item');
                codeList.push(item);
                const [market, symbol] = item.split('.');
                return {
                    symbol,
                    market: market == '105' ? 'US' : market == '106' ? 'HK' : 'CN',
                    code: item,
                };
            });
            // console.log(parsed.length, 'parsed');
            // console.log(rows.length);
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
                    ...datas[index],
                    ...stockInfo.diff[index],
                };
            });

            // -----------------------------
            //  计算基金整体涨跌幅（加权平均）
            // -----------------------------
            // weightPct 是占净值比例9.82 f3是涨跌幅 220 需要 *0.01
            const totalWeight = parsed.reduce((sum, item) => sum + (item.weightPct || 0), 0);
            const weightedSum = parsed.reduce((sum, item) => {
                const weight = item.weightPct || 0; // 9.82
                const changePct = (item.f3 || 0) / 100; // 220 -> 2.20
                return sum + weight * changePct; // 9.82 * 2.2 = 21.604
            }, 0);

            // 加权平均
            const fundChangePct = weightedSum / totalWeight;
            console.log(fundChangePct, 'fundChangePct', weightedSum, totalWeight);
            // console.log(parsed, 'parsed', codes);
            // console.log(stockInfo, 'stockInfo');
            // return stockInfo;
            parsed = parsed.map(item => {
                return {
                    ...item,
                    fundChangePct: fundChangePct.toFixed(2),
                };
            });
            return parsed;
        } catch (error) {
            console.log(error);
        }
    }
    // 根据 查询出来的基金codes 集合获取股票信息
    async getStockInfo(codes: string) {
        const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f2,f3,f12,f14,f9&secids=${codes}`;

        try {
            const res = await axios.get(url);
            // console.log(res.data.data, 'res.data.data');
            return res.data.data;
        } catch (error) {
            console.log(error);
        }
    }

    update(id: number, updateFundEstimateDto: UpdateFundEstimateDto) {
        return `This action updates a #${id} fundEstimate`;
    }

    remove(id: number) {
        return `This action removes a #${id} fundEstimate`;
    }
}
