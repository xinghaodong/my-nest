import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';

@Entity('chat_records')
export class ChatRecord {
    @PrimaryGeneratedColumn()
    conversation_id: number;

    @OneToMany(() => Message, message => message.conversation)
    messages: Message[];

    // 创建时间 createTime
    @CreateDateColumn()
    createTime: Date;

    // 更新时间 modifiedTime
    @CreateDateColumn()
    modifiedTime: Date;

    // 当前回话的title
    @Column({ type: 'varchar', length: 255, nullable: true })
    content: string;
}

@Entity('messages')
export class Message {
    @PrimaryGeneratedColumn()
    message_id: number;

    @ManyToOne(() => ChatRecord, conversation => conversation.messages)
    @JoinColumn({ name: 'conversation_id' }) // 关键：确保外键同步
    // 建立与 Conversation 的关系
    conversation: ChatRecord;

    @Column({ type: 'varchar', length: 50 })
    role: string;

    @Column({ type: 'text' })
    content: string;

    // 创建时间 createTime
    @CreateDateColumn()
    createTime: Date;

    // 是否生成完毕 非必传
    @Column({ nullable: true })
    isCompleted: string;
}
