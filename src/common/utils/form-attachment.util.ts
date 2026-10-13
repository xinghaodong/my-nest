/**
 * ========================================================================
 * 文件名称: form-attachment.util.ts
 * 所属模块: common/utils
 * 功能说明:
 *   提供全表单附件递归深度穿透提取通用纯函数。
 *   支持：
 *   1. 主表单顶层单个/多个附件组件；
 *   2. 单个附件框上传的多张图片/PDF文件；
 *   3. 子表单多行明细内嵌上传的各类附件凭证；
 *   4. 具备循环引用安全防御 (Set visited) 与元数据过滤能力。
 * ========================================================================
 */

/**
 * 判断对象是否为合法表单附件文件对象
 */
export function isFormAttachmentObject(obj: any): boolean {
    return (
        obj &&
        typeof obj === 'object' &&
        Boolean(obj.filePath || obj.url || obj.fileName || obj.path) &&
        !obj.slots &&
        !obj.props
    );
}

/**
 * 递归深度提取表单数据中所有的附件文件列表
 * @param data 表单响应式数据对象 (formData)
 * @returns 扁平化的附件文件对象数组
 */
export function extractAllAttachmentFiles(data: any): any[] {
    const files: any[] = [];
    if (!data || typeof data !== 'object') return files;

    const visited = new Set<any>();

    const traverse = (current: any) => {
        if (!current || visited.has(current)) return;
        if (typeof current === 'object') {
            visited.add(current);
        }

        if (Array.isArray(current)) {
            for (const item of current) {
                if (isFormAttachmentObject(item)) {
                    files.push(item);
                } else if (item && typeof item === 'object') {
                    traverse(item);
                }
            }
        } else if (typeof current === 'object') {
            for (const key of Object.keys(current)) {
                const val = current[key];
                if (isFormAttachmentObject(val)) {
                    files.push(val);
                } else if (val && typeof val === 'object') {
                    traverse(val);
                }
            }
        }
    };

    traverse(data);
    return files;
}
