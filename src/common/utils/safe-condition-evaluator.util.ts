/**
 * 安全条件表达式求值器 (纯白名单递归下降解析，彻底拔除 eval/new Function/this 与一切执行引擎依赖)
 * 
 * 支持语法白名单:
 * - 比较符: ===, !==, ==, !=, >=, <=, >, <
 * - 逻辑符: &&, ||, !
 * - 括号分组: ( ... )
 * - 标识符变量: 匹配用户表单中的任意有效字段名 (如 importantLevel, processStatus, days 等)
 * - 字面量: 数字、字符串 ('...' 或 "..."), true, false, null, undefined
 */

type TokenType = 'OP' | 'LITERAL' | 'IDENT' | 'EOF';

interface Token {
    type: TokenType;
    value: any;
}

export class SafeConditionEvaluator {
    /**
     * 词法分析 (Tokenizer) - 纯白名单字符匹配
     */
    private static tokenize(expr: string): Token[] {
        const tokens: Token[] = [];
        let i = 0;
        const len = expr.length;

        while (i < len) {
            const ch = expr[i];

            // 1. 跳过空白字符
            if (/\s/.test(ch)) {
                i++;
                continue;
            }

            // 2. 三字符全等比较符
            if (expr.slice(i, i + 3) === '===' || expr.slice(i, i + 3) === '!==') {
                tokens.push({ type: 'OP', value: expr.slice(i, i + 3) });
                i += 3;
                continue;
            }

            // 3. 双字符操作符
            const twoChar = expr.slice(i, i + 2);
            if (['==', '!=', '>=', '<=', '&&', '||'].includes(twoChar)) {
                tokens.push({ type: 'OP', value: twoChar });
                i += 2;
                continue;
            }

            // 4. 单字符操作符与括号
            if (['>', '<', '!', '(', ')'].includes(ch)) {
                tokens.push({ type: 'OP', value: ch });
                i++;
                continue;
            }

            // 5. 字符串字面量 ('...' 或 "...")
            if (ch === "'" || ch === '"') {
                const quote = ch;
                let str = '';
                i++;
                while (i < len && expr[i] !== quote) {
                    if (expr[i] === '\\' && i + 1 < len) {
                        i++;
                        str += expr[i];
                    } else {
                        str += expr[i];
                    }
                    i++;
                }
                if (i >= len) throw new Error('未闭合的字符串字面量');
                i++; // 跳过结束引号
                tokens.push({ type: 'LITERAL', value: str });
                continue;
            }

            // 6. 数字字面量
            if (/\d/.test(ch) || (ch === '.' && /\d/.test(expr[i + 1] || ''))) {
                let numStr = '';
                while (i < len && (/\d/.test(expr[i]) || expr[i] === '.')) {
                    numStr += expr[i];
                    i++;
                }
                tokens.push({ type: 'LITERAL', value: Number(numStr) });
                continue;
            }

            // 7. 标识符（变量名或关键字字面量）
            if (/[a-zA-Z_$]/.test(ch)) {
                let ident = '';
                while (i < len && /[a-zA-Z0-9_$]/.test(expr[i])) {
                    ident += expr[i];
                    i++;
                }
                if (ident === 'true') {
                    tokens.push({ type: 'LITERAL', value: true });
                } else if (ident === 'false') {
                    tokens.push({ type: 'LITERAL', value: false });
                } else if (ident === 'null') {
                    tokens.push({ type: 'LITERAL', value: null });
                } else if (ident === 'undefined') {
                    tokens.push({ type: 'LITERAL', value: undefined });
                } else {
                    tokens.push({ type: 'IDENT', value: ident });
                }
                continue;
            }

            // 遇到非白名单字符（如下标 '['、点号 '.'、分号 ';' 等），直接抛错拒绝，彻底扼杀一切对象反射下潜
            throw new Error(`非法字符或未授权语法: "${ch}"`);
        }

        tokens.push({ type: 'EOF', value: null });
        return tokens;
    }

    /**
     * 表达式语法分析与求值
     */
    public static evaluate(expr: string, context: Record<string, any>): boolean {
        if (!expr || !expr.trim()) return false;

        try {
            const tokens = this.tokenize(expr);
            let cursor = 0;

            const peek = (): Token => tokens[cursor];
            const consume = (expectedVal?: string): Token => {
                const tok = tokens[cursor];
                if (expectedVal && tok.value !== expectedVal) {
                    throw new Error(`期望得到 "${expectedVal}", 实际为 "${tok.value}"`);
                }
                cursor++;
                return tok;
            };

            // 优先级 1: 逻辑或 ||
            const parseOr = (): any => {
                let left = parseAnd();
                while (peek().value === '||') {
                    consume('||');
                    const right = parseAnd();
                    left = Boolean(left || right);
                }
                return left;
            };

            // 优先级 2: 逻辑与 &&
            const parseAnd = (): any => {
                let left = parseEquality();
                while (peek().value === '&&') {
                    consume('&&');
                    const right = parseEquality();
                    left = Boolean(left && right);
                }
                return left;
            };

            // 优先级 3: 相等性比较 (==, !=, ===, !==)
            const parseEquality = (): any => {
                let left = parseRelational();
                while (['==', '!=', '===', '!=='].includes(peek().value)) {
                    const op = consume().value;
                    const right = parseRelational();
                    if (op === '==') left = left == right;
                    else if (op === '!=') left = left != right;
                    else if (op === '===') left = left === right;
                    else if (op === '!==') left = left !== right;
                }
                return left;
            };

            // 优先级 4: 大小比较 (>, <, >=, <=)
            const parseRelational = (): any => {
                let left = parseUnary();
                while (['>', '<', '>=', '<='].includes(peek().value)) {
                    const op = consume().value;
                    const right = parseUnary();
                    // 业务友好：字符串数字自动转换数值比较 (如 "3" >= 3)
                    const lNum = typeof left === 'string' && !isNaN(Number(left)) && left.trim() !== '' ? Number(left) : left;
                    const rNum = typeof right === 'string' && !isNaN(Number(right)) && right.trim() !== '' ? Number(right) : right;
                    if (op === '>') left = lNum > rNum;
                    else if (op === '<') left = lNum < rNum;
                    else if (op === '>=') left = lNum >= rNum;
                    else if (op === '<=') left = lNum <= rNum;
                }
                return left;
            };

            // 优先级 5: 一元取反 !
            const parseUnary = (): any => {
                if (peek().value === '!') {
                    consume('!');
                    return !parseUnary();
                }
                return parsePrimary();
            };

            // 优先级 6: 基础单元 (括号分组、字面量、安全变量)
            const parsePrimary = (): any => {
                const tok = peek();
                if (tok.value === '(') {
                    consume('(');
                    const val = parseOr();
                    consume(')');
                    return val;
                }
                if (tok.type === 'LITERAL') {
                    consume();
                    return tok.value;
                }
                if (tok.type === 'IDENT') {
                    consume();
                    const ident = tok.value;
                    // 纯净只读 context 自身属性，严格拒绝原型链穿透
                    if (context && Object.prototype.hasOwnProperty.call(context, ident)) {
                        const val = context[ident];
                        if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                            return Number(val);
                        }
                        return val;
                    }
                    return undefined;
                }
                throw new Error(`非预期的语法标记: ${JSON.stringify(tok)}`);
            };

            const result = parseOr();
            if (peek().type !== 'EOF') {
                throw new Error(`表达式解析未完全完成，残留符号: ${JSON.stringify(peek())}`);
            }
            return Boolean(result);
        } catch (err: any) {
            console.warn(`⚠️ [安全条件评估器] 语法解析或求值异常 (${err.message})，表达式: "${expr}"`);
            return false;
        }
    }
}
