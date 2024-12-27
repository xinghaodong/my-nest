import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, BeforeInsert, ManyToMany, JoinTable } from 'typeorm';
import { FileList } from '../../filelist/entities/filelist.entity';
import { Role } from '../../role/entities/role.entity';
import { IsEmail, IsNotEmpty } from 'class-validator';
import * as bcrypt from 'bcryptjs'; // 导入 bcrypt 加密库

@Entity()
export class InternalUser {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    username: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    age: string;

    @Column()
    password: string;

    // 邮箱
    @Column()
    @IsEmail() // 验证格式是否为有效 email
    email: string;

    // 绑定附件表的 id
    @ManyToOne(() => FileList, { nullable: true }) // 可为空
    @JoinColumn({ name: 'avatar_id' })
    avatar: FileList | null = null;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;

    @ManyToMany(() => Role)
    @JoinTable()
    roles: Role[];

    roleIds?: number[];
}
