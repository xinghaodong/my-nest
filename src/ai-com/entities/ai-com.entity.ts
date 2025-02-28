import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('chat_records') // 数据库表名
export class ChatRecord {
    @PrimaryGeneratedColumn()
    id: number; // 主键，自增

    @Column({ type: 'varchar', length: 50 })
    role: string; // 消息角色（如 user 或 assistant）

    @Column({ type: 'text' })
    content: string; // 消息内容

    @Column({ type: 'varchar', length: 255 })
    conversationId: string; // 会话 ID，用于区分不同的对话

    @CreateDateColumn()
    createdAt: Date; // 创建时间
}
