// 统一响应成功拦截器 (Interceptor)
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ApiResponse<T> {
    data: T;
    code: number;
    message: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        // 如果是 SSE 长连接或者文件流，直接放行，避免破坏 text/event-stream 格式
        if (req?.headers?.accept === 'text/event-stream' || req?.url?.includes('/stream')) {
            return next.handle();
        }

        return next.handle().pipe(
            map(data => ({
                data: data,
                code: 200,
                message: '操作成功',
            })),
        );
    }
}
