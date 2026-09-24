import { Repository, Not } from 'typeorm';
import { ApprovalInstance } from '../../../../../logic-flow/entities/approval-instance.entity';

/**
 * 单张提取出的发票关键特征结构
 */
export interface ExtractedInvoiceInfo {
    name: string;
    amount: number;
    text: string;
    invoiceNumber?: string; // 发票号码 (8~20位数字)
    invoiceCode?: string;   // 发票代码 (10~12位数字)
    taxCode?: string;       // 纳税人识别号/统一社会信用代码 (18位)
    sellerName?: string;    // 销售方公司名称
    invoiceDate?: string;   // 开票日期 (YYYY-MM-DD)
    buyerName?: string;     // 购买方企业名称/个人
    buyerTaxCode?: string;  // 购买方统一社会信用代码/税号
}

/**
 * 税号算法校验结果
 */
export interface TaxCodeValidationResult {
    taxCode: string;
    companyName?: string;
    invoiceName?: string;
    valid: boolean;
    type: 'unified_credit_code' | 'legacy_tax_code' | 'invalid';
    reason?: string;
}

/**
 * 购买方核验结果项
 */
export interface InvoiceBuyerCheckItem {
    invoiceName: string;
    buyerName?: string;
    buyerTaxCode?: string;
    expectedCompanyName?: string;
    expectedCompanyTaxCode?: string;
    isMatched: boolean;
    reason?: string;
}

/**
 * 发票超期检测结果项 (用于人机协同特批)
 */
export interface InvoiceOverdueItem {
    invoiceName: string;
    invoiceDate: string;
    overdueDays: number;
    isOverdue: boolean;
    message: string;
}

/**
 * 发票查重检测结果项
 */
export interface InvoiceDuplicationItem {
    invoiceNumber: string;
    invoiceCode?: string;
    invoiceName: string;
    isDuplicate: boolean;
    duplicateType?: 'batch_duplicate' | 'history_duplicate';
    conflictInstanceId?: number;
    conflictApplicant?: string;
    conflictTime?: string;
    message: string;
}

/**
 * 连号检测结果项
 */
export interface ConsecutiveWarningItem {
    invoiceNumbers: string[];
    sellerName?: string;
    message: string;
}

/**
 * 确定性工具综合核验证据
 */
export interface ToolAuditEvidence {
    taxCodeChecks: TaxCodeValidationResult[];
    duplicationChecks: InvoiceDuplicationItem[];
    consecutiveChecks: ConsecutiveWarningItem[];
    overdueChecks?: InvoiceOverdueItem[]; // 超期核验项
    buyerChecks?: InvoiceBuyerCheckItem[]; // 购买方核验项
    hasCriticalFraud: boolean; // 是否命中高危欺诈（假税号、重复报销）
    hasOverdue?: boolean;      // 是否命中发票超期
    hasBuyerMismatch?: boolean; // 是否命中发票购买方不符
    buyerMismatchDetail?: string; // 购买方不符详情描述
    maxOverdueDays?: number;   // 最大超期天数
    summaryNotes: string[];
    fraudAlerts?: string[]; // 真实的欺诈违规项（专供异常列表）
    passedNotes?: string[]; // 真实通过的合规证据（专供合规背书，严禁当做异常）
}

/**
 * 工具 1：国家标准 GB 32100-2015 统一社会信用代码算法校验 (100% 确定性纯算法校验)
 * 字符集: 0-9, A-Z (剔除易混淆的 I, O, S, V, Z 5个字母，共 31 个有效代码字符)
 * 加权因子 W = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28]
 */
export function validateUnifiedSocialCreditCode(taxCode: string): { valid: boolean; type: 'unified_credit_code' | 'legacy_tax_code' | 'invalid'; reason?: string } {
    if (!taxCode || typeof taxCode !== 'string') {
        return { valid: false, type: 'invalid', reason: '税号为空' };
    }

    const code = taxCode.trim().toUpperCase();

    // 兼容老税号 (15 位纯数字)
    if (/^\d{15}$/.test(code)) {
        return { valid: true, type: 'legacy_tax_code', reason: '符合15位历史企业纳税人识别号规范' };
    }

    if (code.length !== 18) {
        return { valid: false, type: 'invalid', reason: `统一社会信用代码应为18位 (当前实际为 ${code.length} 位)` };
    }

    const CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
    const WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

    // 登记管理部门代码核验: 1:机构编制, 2:外交, 3:司法, 5:民政, 9:工商, Y:其他
    const firstChar = code[0];
    if (!'12359Y'.includes(firstChar)) {
        return { valid: false, type: 'invalid', reason: `首位登记管理部门代码 [${firstChar}] 不符合国家GB 32100规范` };
    }

    let sum = 0;
    for (let i = 0; i < 17; i++) {
        const char = code[i];
        const val = CHARS.indexOf(char);
        if (val === -1) {
            return { valid: false, type: 'invalid', reason: `第 ${i + 1} 位字符 [${char}] 不在GB 32100字符集内(严禁包含字母 I, O, S, V, Z)` };
        }
        sum += val * WEIGHTS[i];
    }

    const remainder = sum % 31;
    const checkValue = (31 - remainder) === 31 ? 0 : (31 - remainder);
    const expectedCheckChar = CHARS[checkValue];
    const actualCheckChar = code[17];

    if (actualCheckChar !== expectedCheckChar) {
        return {
            valid: false,
            type: 'invalid',
            reason: `统一社会信用代码校验位不匹配 (算法推导应为 [${expectedCheckChar}], 票面实际为 [${actualCheckChar}]), 疑似伪造假税号`,
        };
    }

    return { valid: true, type: 'unified_credit_code', reason: '通过国家标准 GB 32100-2015 算法加权校验' };
}

/**
 * 辅助方法：从发票文本或文件名中精准提取发票结构化特征
 */
export function extractInvoiceIdentifiers(name: string, text: string): Partial<ExtractedInvoiceInfo> {
    const result: Partial<ExtractedInvoiceInfo> = {
        name,
        text,
    };

    // 1. 提取发票代码 (通常为 10 位或 12 位数字)
    const codeMatch = text.match(/(?:发票代码|代码)[:：\s]*(\d{10,12})/i)
                   || name.match(/_(\d{10,12})_/);
    if (codeMatch) {
        result.invoiceCode = codeMatch[1];
    }

    // 2. 提取发票号码 (增值税发票8位或数电发票20位)
    const numMatch = text.match(/(?:发票号码|号码|NO\.?)[:：\s]*(\d{8,20})/i)
                  || name.match(/_(\d{8,20})\.pdf/i)
                  || text.match(/(\d{20})/);
    if (numMatch) {
        result.invoiceNumber = numMatch[1];
    }

    // 3. 提取开票日期 (支持 2024年05月20日 / 2024-05-20 / 2024/05/20 / 2024.05.20 等常规发票开票日期)
    const dateMatch = text.match(/(?:开票日期|开票时间|日期)[:：\s]*(\d{4}[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}日?)/i)
                   || text.match(/\b(20\d{2}[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}日?)\b/)
                   || name.match(/_(\d{4}[-\/.]\d{2}[-\/.]\d{2})_/);
    if (dateMatch) {
        const rawDate = dateMatch[1].replace(/[年月日]/g, m => m === '日' ? '' : '-').replace(/[\/.]/g, '-');
        const parts = rawDate.split('-').filter(Boolean);
        if (parts.length === 3) {
            const y = parts[0];
            const m = parts[1].padStart(2, '0');
            const d = parts[2].padStart(2, '0');
            result.invoiceDate = `${y}-${m}-${d}`;
        }
    }

    // 4. 优先从文件名获取提示性销售方名称 (如 交通_167.91元_..._滴滴出行科技有限公司_...)
    const nameSellerMatch = name.match(/_([\u4e00-\u9fa5（）()a-zA-Z0-9]{4,35}(?:公司|企业|部|店))_/);
    let hintSellerName = nameSellerMatch ? nameSellerMatch[1].trim() : '';

    // 5. 核心算法：全文本行级实体扫描 (专克增值税电子发票 Label与内容分离 的流式排版)
    const lines = (text || '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const matchedEntities: Array<{ name: string; taxCode?: string }> = [];
    const ignoreTableKeywords = [
        '货物或应税劳务', '增值税', '发票专用章', '开票人', '收款人', '复核', '密码区',
        '机器编号', '纳税人识别号', '开户行及账号', '单价', '金额', '税额', '服务名称', '校验码', '规格型号', '项目名称'
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (ignoreTableKeywords.some(w => line.includes(w))) continue;

        // 识别企业全称特征
        const isCompany = /^[\u4e00-\u9fa5（）()a-zA-Z0-9]{4,45}(?:公司|分公司|企业|局|厂|所|行|院|中心|队|学校|医院|店|部)$/.test(line);
        if (isCompany) {
            let foundTax = '';
            // 向下探测 1~3 行寻找紧邻的 15~18 位统一社会信用代码
            for (let j = 1; j <= 3 && (i + j) < lines.length; j++) {
                const nextL = lines[i + j];
                const taxMatch = nextL.match(/^[0-9A-HJ-NP-RT-UW-YA-Z]{15,18}$/i);
                if (taxMatch) {
                    foundTax = taxMatch[0].toUpperCase();
                    break;
                }
            }
            if (!matchedEntities.some(e => e.name === line)) {
                matchedEntities.push({ name: line, taxCode: foundTax || undefined });
            }
        }
    }

    // 🌟 如果行级扫描未识别到 2 个企业主体（例如文本中换行符被拍平或来自流式无换行 OCR），启用流式全局实体扫描
    if (matchedEntities.length < 2) {
        const streamCompanyRegex = /(?:^|[\s,;，；])([\u4e00-\u9fa5（）()a-zA-Z0-9]{4,45}(?:公司|分公司|企业|局|厂|所|院|中心|队|学校|医院|店|部))(?:\s+([0-9A-HJ-NP-RT-UW-YA-Z]{15,18}))?/g;
        let match: RegExpExecArray | null;
        while ((match = streamCompanyRegex.exec(text)) !== null) {
            const entName = match[1].trim();
            if (ignoreTableKeywords.some(w => entName.includes(w))) continue;
            if (entName.includes('路') || entName.includes('号') || entName.includes('支行') || entName.includes('分行')) continue;
            const existing = matchedEntities.find(e => e.name === entName);
            if (!existing) {
                matchedEntities.push({ name: entName, taxCode: match[2]?.toUpperCase() });
            } else if (!existing.taxCode && match[2]) {
                existing.taxCode = match[2].toUpperCase();
            }
        }
    }

    // 6. 实体智能归属与互斥判定
    // 优先考虑带有税号的实体（发票抬头和开票方通常都带有统一社会信用代码）
    const entitiesWithTax = matchedEntities.filter(e => e.taxCode);
    const activeEntities = entitiesWithTax.length >= 2 ? entitiesWithTax : matchedEntities;

    if (activeEntities.length >= 2) {
        // 如果扫描出两个以上的企业主体：
        let sellerIdx = -1;
        if (hintSellerName) {
            sellerIdx = activeEntities.findIndex(e => e.name.includes(hintSellerName) || hintSellerName.includes(e.name));
        }

        if (sellerIdx === -1) {
            // 增值税发票标准自上而下排版：排在前面的第 1 个是买方，第 2 个是卖方
            result.buyerName = activeEntities[0].name;
            result.buyerTaxCode = activeEntities[0].taxCode;
            result.sellerName = activeEntities[1].name;
            result.taxCode = activeEntities[1].taxCode;
        } else {
            // 确定了卖方索引，则另一个为买方
            const buyerIdx = sellerIdx === 0 ? 1 : 0;
            result.buyerName = activeEntities[buyerIdx].name;
            result.buyerTaxCode = activeEntities[buyerIdx].taxCode;
            result.sellerName = activeEntities[sellerIdx].name;
            result.taxCode = activeEntities[sellerIdx].taxCode;
        }
    } else if (activeEntities.length === 1) {
        const ent = activeEntities[0];
        if (hintSellerName && (ent.name.includes(hintSellerName) || hintSellerName.includes(ent.name))) {
            result.sellerName = ent.name;
            result.taxCode = ent.taxCode;
        } else {
            result.buyerName = ent.name;
            result.buyerTaxCode = ent.taxCode;
        }
    }

    // 7. 若上述实体扫描未匹配完全，启动标准正则多模式兜底
    if (!result.sellerName) {
        const sellerSectionNameMatch = text.match(/销\s*售\s*方[\s\S]*?名称[:：\s]*([\u4e00-\u9fa5（）()a-zA-Z0-9]{4,35}(?:公司|分公司|企业|局|厂|所|行|院|中心|店|部))/i);
        if (sellerSectionNameMatch) {
            result.sellerName = sellerSectionNameMatch[1].trim();
        } else if (hintSellerName) {
            result.sellerName = hintSellerName;
        }
    }

    if (!result.taxCode) {
        const sellerTaxMatch = text.match(/销\s*售\s*方[\s\S]*?(?:统一社会信用代码|纳税人识别号|税\s*号)[:：\s]*([0-9A-HJ-NP-RT-UW-YA-Z]{15,18})/i);
        if (sellerTaxMatch) {
            result.taxCode = sellerTaxMatch[1].trim().toUpperCase();
        }
    }

    if (!result.buyerName) {
        const buyerNameMatch = text.match(/购\s*买\s*方[\s\S]*?名称[:：\s]*([\u4e00-\u9fa5（）()a-zA-Z0-9]{2,40})/i)
                            || text.match(/买\s*方[\s\S]*?名称[:：\s]*([\u4e00-\u9fa5（）()a-zA-Z0-9]{2,40})/i)
                            || text.match(/(?:购\s*买\s*方|买\s*方|受票方)[:：\s]*([\u4e00-\u9fa5（）()a-zA-Z0-9]{2,40}(?:公司|分公司|局|院|中心|所|厂|队|行|个人))/i);
        if (buyerNameMatch && !ignoreTableKeywords.some(w => buyerNameMatch[1].includes(w))) {
            result.buyerName = buyerNameMatch[1].trim();
        }
    }

    if (!result.buyerTaxCode) {
        const buyerTaxMatch = text.match(/购\s*买\s*方[\s\S]*?(?:统一社会信用代码|纳税人识别号|税\s*号)[:：\s]*([0-9A-HJ-NP-RT-UW-YA-Z]{15,18})/i)
                           || text.match(/买\s*方[\s\S]*?(?:统一社会信用代码|纳税人识别号|税\s*号)[:：\s]*([0-9A-HJ-NP-RT-UW-YA-Z]{15,18})/i);
        if (buyerTaxMatch) {
            result.buyerTaxCode = buyerTaxMatch[1].trim().toUpperCase();
        }
    }

    return result;
}

/**
 * 工具 2：发票查重与内控防舞弊排查 (支持当前批次自重查 + 跨单据历史数据库查重)
 */
export async function checkInvoiceDuplicationTool(
    invoices: ExtractedInvoiceInfo[],
    currentInstanceId: number,
    instanceRepo?: Repository<ApprovalInstance>,
): Promise<InvoiceDuplicationItem[]> {
    const duplicateResults: InvoiceDuplicationItem[] = [];
    const seenNumbers = new Map<string, string>(); // invoiceNumber -> fileName

    // 1. 本次报销提交的附件集合内部排查自重
    for (const inv of invoices) {
        if (!inv.invoiceNumber || inv.invoiceNumber.length < 7) continue;

        if (seenNumbers.has(inv.invoiceNumber)) {
            duplicateResults.push({
                invoiceNumber: inv.invoiceNumber,
                invoiceCode: inv.invoiceCode,
                invoiceName: inv.name,
                isDuplicate: true,
                duplicateType: 'batch_duplicate',
                message: `发票号码 [${inv.invoiceNumber}] 在当前单据内被多次上传 (与文件 "${seenNumbers.get(inv.invoiceNumber)}" 重复)!`,
            });
        } else {
            seenNumbers.set(inv.invoiceNumber, inv.name);
        }
    }

    // 2. 跨单据历史库排查重复报销 (排除当前单据，且排除已明确驳回状态 3 的历史单据)
    if (instanceRepo && invoices.length > 0) {
        try {
            const validInvNumbers = invoices.map(i => i.invoiceNumber).filter(n => n && n.length >= 7) as string[];

            if (validInvNumbers.length > 0) {
                // 查询历史审批单（排除当前实例、排除驳回实例）
                const historyInstances = await instanceRepo.find({
                    where: currentInstanceId > 0 ? { id: Not(currentInstanceId), status: Not('3') } : { status: Not('3') },
                    select: ['id', 'title', 'userName', 'status', 'formData', 'created_at'],
                    take: 100, // 检查最近 100 笔审批单
                    order: { id: 'DESC' },
                });

                for (const inv of invoices) {
                    let firstConflict: { hist: any; dupReason: string } | null = null;
                    let duplicateCount = 0;

                    for (const hist of historyInstances) {
                        const histFormStr = JSON.stringify(hist.formData || '');
                        let isDup = false;
                        let dupReason = '';

                        // 维度 1: 发票号码精准匹配
                        if (inv.invoiceNumber && inv.invoiceNumber.length >= 7 && histFormStr.includes(inv.invoiceNumber)) {
                            isDup = true;
                            dupReason = `发票号码 [${inv.invoiceNumber}] 已在历史报销单 #${hist.id} 中被报销过`;
                        }

                        // 维度 2: 发票原始附件同名与同源特征精准匹配 (防止历史单据未提取发票号导致的漏检)
                        if (!isDup && inv.name && inv.name.length > 4 && histFormStr.includes(inv.name)) {
                            isDup = true;
                            dupReason = `发票凭证附件 [${inv.name}] 已在历史报销单 #${hist.id} 中提交报销过，涉嫌重复报销同一凭证！`;
                        }

                        if (isDup) {
                            duplicateCount++;
                            if (!firstConflict) {
                                firstConflict = { hist, dupReason };
                            }
                        }
                    }

                    // 针对该发票，只要命中一次即生成一条精炼有力的预警，包含最新冲突与累计次数
                    if (firstConflict) {
                        const { hist, dupReason } = firstConflict;
                        const countSuffix = duplicateCount > 1 ? `（历史审批单据中累计重复出现 ${duplicateCount} 次）` : '';
                        duplicateResults.push({
                            invoiceNumber: inv.invoiceNumber || '同名凭证',
                            invoiceCode: inv.invoiceCode,
                            invoiceName: inv.name,
                            isDuplicate: true,
                            duplicateType: 'history_duplicate',
                            conflictInstanceId: hist.id,
                            conflictApplicant: hist.userName,
                            conflictTime: hist.created_at ? new Date(hist.created_at).toLocaleDateString() : '近期',
                            message: `${dupReason} (申请人: ${hist.userName || '未知'}, 申请时间: ${hist.created_at ? new Date(hist.created_at).toLocaleDateString() : '-'}) ${countSuffix}`.trim(),
                        });
                    }
                }
            }
        } catch (dbErr) {
            console.warn('⚠️ [发票查重工具] 历史库比对查询异常，跳过历史比对:', dbErr.message);
        }
    }

    return duplicateResults;
}

/**
 * 工具 3：发票连号与集中开票套现排查
 */
export function checkConsecutiveInvoicesTool(invoices: ExtractedInvoiceInfo[]): ConsecutiveWarningItem[] {
    const warnings: ConsecutiveWarningItem[] = [];
    if (invoices.length < 2) return warnings;

    // 筛选出拥有有效发票号码的发票列表
    const validInvoices = invoices.filter(i => i.invoiceNumber && /^\d{8,12}$/.test(i.invoiceNumber));
    if (validInvoices.length < 2) return warnings;

    for (let i = 0; i < validInvoices.length; i++) {
        for (let j = i + 1; j < validInvoices.length; j++) {
            const invA = validInvoices[i];
            const invB = validInvoices[j];

            const numA = parseInt(invA.invoiceNumber!, 10);
            const numB = parseInt(invB.invoiceNumber!, 10);

            // 发票号码差值为 1 或 2，判定为紧邻连号
            if (Math.abs(numA - numB) <= 2 && Math.abs(numA - numB) > 0) {
                // 如果两张发票代码相同或开票方相同，提示连号风险
                const isSameSeller = (invA.sellerName && invB.sellerName && invA.sellerName === invB.sellerName)
                                  || (invA.invoiceCode && invB.invoiceCode && invA.invoiceCode === invB.invoiceCode);
                warnings.push({
                    invoiceNumbers: [invA.invoiceNumber!, invB.invoiceNumber!],
                    sellerName: invA.sellerName || invB.sellerName || '同一开票源',
                    message: `发票 [${invA.invoiceNumber}] 与 [${invB.invoiceNumber}] 呈现紧邻连号特征${isSameSeller ? '且开票方一致' : ''}，疑似集中虚开/套现凑票，建议人工复核业务真实性。`,
                });
            }
        }
    }

    return warnings;
}

/**
 * 工具 4：发票开票日期超期检测 (时效合规与人机协同特批挂起)
 * @param invoices 提取的发票列表
 * @param maxDays 允许的最大报销时效天数 (默认 90 天，如季度内报销)
 */
export function checkInvoiceOverdueTool(
    invoices: ExtractedInvoiceInfo[],
    maxDays = 90,
): { overdueList: InvoiceOverdueItem[]; hasOverdue: boolean; maxOverdueDays: number; summary: string } {
    const overdueList: InvoiceOverdueItem[] = [];
    const now = new Date();
    let maxOverdueDays = 0;

    for (const inv of invoices) {
        if (!inv.invoiceDate) continue;
        const invTime = new Date(inv.invoiceDate).getTime();
        if (isNaN(invTime)) continue;

        // 计算距今天数
        const diffDays = Math.floor((now.getTime() - invTime) / (1000 * 60 * 60 * 24));
        if (diffDays > maxDays) {
            if (diffDays > maxOverdueDays) maxOverdueDays = diffDays;
            overdueList.push({
                invoiceName: inv.name,
                invoiceDate: inv.invoiceDate,
                overdueDays: diffDays,
                isOverdue: true,
                message: `发票 [${inv.name}] 开票日期为 [${inv.invoiceDate}]，距今已跨期超期 ${diffDays} 天 (系统规定时效 ≤ ${maxDays} 天)，属于严重超期单据！`,
            });
        }
    }

    const hasOverdue = overdueList.length > 0;
    const summary = hasOverdue
        ? `检测到 ${overdueList.length} 张发票存在跨期超期异常 (最大超期 ${maxOverdueDays} 天)，按财务制度触发人机协同挂起，需财务专员特批放行`
        : `发票开票时效核验通过：全部发票开票日期均在 ${maxDays} 天正常报销期内`;

    return { overdueList, hasOverdue, maxOverdueDays, summary };
}

/**
 * 工具 5：发票购买方（公司法定抬头与统一社会信用代码）合规性核验工具
 */
export function checkInvoiceBuyerTool(
    invoices: ExtractedInvoiceInfo[],
    expectedCompany?: { companyName?: string; taxCode?: string },
): {
    buyerChecks: InvoiceBuyerCheckItem[];
    hasBuyerMismatch: boolean;
    buyerMismatchDetail?: string;
    summaryNotes: string[];
    fraudAlerts: string[];
    passedNotes: string[];
} {
    const buyerChecks: InvoiceBuyerCheckItem[] = [];
    const summaryNotes: string[] = [];
    const fraudAlerts: string[] = [];
    const passedNotes: string[] = [];
    let hasBuyerMismatch = false;
    let buyerMismatchDetail = '';

    const expName = expectedCompany?.companyName?.trim();
    const expTax = expectedCompany?.taxCode?.trim().toUpperCase();

    // 如果未配置任何期望公司抬头与税号，跳过严格核验
    if (!expName && !expTax) {
        return {
            buyerChecks,
            hasBuyerMismatch: false,
            summaryNotes,
            fraudAlerts,
            passedNotes,
        };
    }

    for (const inv of invoices) {
        const invBuyerName = inv.buyerName?.trim();
        const invBuyerTax = inv.buyerTaxCode?.trim().toUpperCase();

        let isMatched = true;
        const mismatchReasons: string[] = [];

        // 1. 抬头明确为“个人”直接一票否决
        if (invBuyerName === '个人' || (invBuyerName && invBuyerName.includes('个人') && invBuyerName.length <= 4)) {
            isMatched = false;
            mismatchReasons.push(`发票购买方抬头为个人消费凭证，非公司法定入账抬头`);
        }

        // 2. 税号核对 (最权威硬核准则)
        if (expTax && invBuyerTax) {
            if (expTax !== invBuyerTax) {
                isMatched = false;
                mismatchReasons.push(`发票购买方税号 [${invBuyerTax}] 与报销单位代码 [${expTax}] 不一致`);
            }
        }

        // 3. 企业名称核对
        if (expName && invBuyerName && invBuyerName !== '个人') {
            const normInvName = invBuyerName.replace(/[\s（）()]/g, '');
            const normExpName = expName.replace(/[\s（）()]/g, '');
            if (!normInvName.includes(normExpName) && !normExpName.includes(normInvName)) {
                isMatched = false;
                mismatchReasons.push(`发票购买方抬头 [${invBuyerName}] 与报销所属单位 [${expName}] 不一致`);
            }
        }

        // 如果发票中完全没有买方信息且是合规发票，给出提醒但不轻易误杀
        if (!invBuyerName && !invBuyerTax) {
            // 未提取到买方抬头（如定额发票或打车票简版）
            mismatchReasons.push('未检测到发票购买方信息');
        }

        const checkItem: InvoiceBuyerCheckItem = {
            invoiceName: inv.name,
            buyerName: invBuyerName,
            buyerTaxCode: invBuyerTax,
            expectedCompanyName: expName,
            expectedCompanyTaxCode: expTax,
            isMatched,
            reason: mismatchReasons.join('；') || '发票购买方与报销企业主体一致',
        };
        buyerChecks.push(checkItem);

        if (!isMatched) {
            hasBuyerMismatch = true;
            const alertMsg = `【发票抬头不符】发票 [${inv.name}] 购买方信息不合规: ${checkItem.reason}`;
            summaryNotes.push(alertMsg);
            fraudAlerts.push(alertMsg);
            if (!buyerMismatchDetail) {
                buyerMismatchDetail = alertMsg;
            }
        } else if (invBuyerName || invBuyerTax) {
            const passMsg = `【发票抬头核验通过】发票 [${inv.name}] 购买方信息与当前报销所属法人单位一致`;
            summaryNotes.push(passMsg);
            passedNotes.push(passMsg);
        }
    }

    return {
        buyerChecks,
        hasBuyerMismatch,
        buyerMismatchDetail,
        summaryNotes,
        fraudAlerts,
        passedNotes,
    };
}
