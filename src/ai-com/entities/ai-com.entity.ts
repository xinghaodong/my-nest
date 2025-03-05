import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne } from 'typeorm';

// @Entity('chat_records') // 数据库表名
// export class ChatRecord {
//     @PrimaryGeneratedColumn()
//     id: number; // 主键，自增

//     @Column({ type: 'varchar', length: 50 })
//     role: string; // 消息角色（如 user 或 assistant）

//     @Column({ type: 'text' })
//     content: string; // 消息内容

//     @Column({ type: 'varchar', length: 255 })
//     conversationId: string; // 会话 ID，用于区分不同的对话

//     @CreateDateColumn()
//     created_at: Date; // 创建时间
// }

@Entity('chat_records')
export class ChatRecord {
    @PrimaryGeneratedColumn()
    conversation_id: number;

    // 会话随机id
    @Column({ type: 'varchar', length: 255 })
    conversation_random_id: string;

    @OneToMany(() => Message, message => message.conversation)
    messages: Message[];
}

@Entity('messages')
export class Message {
    @PrimaryGeneratedColumn()
    message_id: number;

    @ManyToOne(() => ChatRecord, conversation => conversation.messages)
    // 建立与 Conversation 的关系
    conversation: ChatRecord;

    @Column({ type: 'varchar', length: 50 })
    role: string;

    @Column({ type: 'text' })
    content: string;
}
