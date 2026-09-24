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
    hasCriticalFraud: boolean; // 是否命中高危欺诈（假税号、重复报销）
    hasOverdue?: boolean;      // 是否命中发票超期
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

    // 1. 优先提取销售方信息区域内的纳税人识别号/统一社会信用代码 (排除买方单位税号)
    const sellerTaxMatch = text.match(/销\s*售\s*方[\s\S]*?(?:统一社会信用代码|纳税人识别号|税\s*号)[:：\s]*([0-9A-HJ-NP-RT-UW-YA-Z]{15,18})/i);
    if (sellerTaxMatch) {
        result.taxCode = sellerTaxMatch[1].trim().toUpperCase();
    } else {
        const taxMatch = text.match(/(?:纳税人识别号|统一社会信用代码|税\s*号)[:：\s]*([0-9A-HJ-NP-RT-UW-YA-Z]{15,18})/i)
                      || text.match(/\b([1-9A-GY][1-9][0-9]{6}[0-9A-HJ-NP-RT-UW-YA-Z]{10})\b/);
        if (taxMatch) {
            result.taxCode = taxMatch[1].trim().toUpperCase();
        }
    }

    // 2. 提取发票代码 (通常为 10 位或 12 位数字)
    const codeMatch = text.match(/(?:发票代码|代码)[:：\s]*(\d{10,12})/i)
                   || name.match(/_(\d{10,12})_/);
    if (codeMatch) {
        result.invoiceCode = codeMatch[1];
    }

    // 3. 提取发票号码 (增值税发票8位或数电发票20位)
    const numMatch = text.match(/(?:发票号码|号码|NO\.?)[:：\s]*(\d{8,20})/i)
                  || name.match(/_(\d{8,20})\.pdf/i)
                  || text.match(/(\d{20})/); // 匹配全电发票 20 位长发票号码
    if (numMatch) {
        result.invoiceNumber = numMatch[1];
    }

    // 4. 提取销售方名称 (优先从销售方区域提取)
    const sellerSectionNameMatch = text.match(/销\s*售\s*方[\s\S]*?名称[:：\s]*([\u4e00-\u9fa5（）()a-zA-Z0-9]{4,35}(?:公司|企业|局|厂|所|行|院|中心|店|部))/i);
    if (sellerSectionNameMatch) {
        result.sellerName = sellerSectionNameMatch[1].trim();
    } else {
        const sellerMatch = text.match(/(?:销售方|销方|开票单位|开票方)(?:名称)?[:：\s]*([\u4e00-\u9fa5（）()a-zA-Z0-9]{4,35}(?:公司|企业|局|厂|所|行|院|中心|店|部))/i)
                         || name.match(/_([\u4e00-\u9fa5（）()a-zA-Z0-9]{4,35}(?:公司|企业|部|店))_/);
        if (sellerMatch) {
            result.sellerName = sellerMatch[1].trim();
        }
    }

    // 5. 提取开票日期 (支持 2024年05月20日 / 2024-05-20 / 2024/05/20 / 2024.05.20 等常规发票开票日期)
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
