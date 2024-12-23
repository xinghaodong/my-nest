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

        // 设置错误信息
        let message = exception.message ? exception.message : `${status >= 500 ? '服务异常' : '服务异常'}`;

        // 如果是验证错误，进一步处理错误信息
        if (exception instanceof BadRequestException) {
            const validationErrors = exception.getResponse() as { [key: string]: any };
            if (validationErrors && validationErrors.error) {
                if (Array.isArray(validationErrors.message)) {
                    message = validationErrors.message[0];
                } else {
                    message = validationErrors.message;
                }
            }
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
