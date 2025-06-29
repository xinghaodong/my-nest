import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

// 绝对路径加载 .env 文件
const envPath = path.resolve(process.cwd(), '.env.development');
config({ path: envPath });


export const typeormConfig = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '123456', // 默认密码
  database: process.env.DB_DATABASE || 'nestdatabase',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migration/*{.ts,.js}'],
  synchronize: true,
});