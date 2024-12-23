import { SetMetadata } from '@nestjs/common';

// 定义一个装饰器来标记公共路由
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
