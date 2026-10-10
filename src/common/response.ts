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
    intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
        // 【1. 前置阶段】：Controller 执行之前 在这里写代码（next.handle() 执行之前）
        // 比如：const start = Date.now(); 记录请求到达的时间点
        return next.handle().pipe(
            // 【2. 后置阶段】：在这里写代码（Controller 算完 return 之后）
            // 比如：用 map 把 Controller 返回的 data 打包成 { code: 200, data }
            // 比如：console.log(`耗时: ${Date.now() - start}ms`);
            map(data => ({
                data: data,
                code: 200,
                message: '操作成功',
            })),
        );
    }
}
