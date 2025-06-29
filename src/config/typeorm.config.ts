import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

// 绝对路径加载 .env 文件（关键修复）
const envPath = path.resolve(process.cwd(), '.env.development');
config({ path: envPath });


export const typeormConfig = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '123456', // 默认密码
  database: process.env.DB_DATABASE || 'nestdatabase',
  entities: [path.join(__dirname, '../**/*.entity.ts')],
  migrations: [path.join(__dirname, '../migrations/*.ts')],
  synchronize: false,
});