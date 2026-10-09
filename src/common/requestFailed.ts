import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const status = exception.getStatus();

        // 检查是否已经发送响应，避免 "Cannot set headers after they are sent to the client" 错误
        if (response.headersSent) {
            return;
        }

        // 设置错误信息（统一规范提取，杜绝将对象泄露至 message）
        const res = exception.getResponse();
        let message: any = exception.message || (status >= 500 ? '服务异常' : '请求失败');

        if (typeof res === 'string') {
            message = res;
        } else if (typeof res === 'object' && res !== null) {
            const resObj = res as Record<string, any>;
            if (Array.isArray(resObj.message)) {
                message = resObj.message[0];
            } else if (typeof resObj.message === 'string') {
                message = resObj.message;
            } else if (typeof resObj.error === 'string') {
                message = resObj.error;
            }
        }

        // 终极防线：杜绝复杂对象直接吐给前端导致 [object Object]
        if (typeof message !== 'string') {
            message = (message && (message.message || message.error)) ? String(message.message || message.error) : '请求参数校验不合法';
        }

        const errorResponse = {
            data: {}, // 可添加详细错误信息
            message: message,
            code: status, // 或自定义 code
            timestamp: new Date().toISOString(),
            path: request.url,
        };

        // 发送响应
        response.status(status).json(errorResponse);
    }
}
