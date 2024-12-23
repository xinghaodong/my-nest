import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, BeforeInsert } from 'typeorm';
import { FileList } from '../../filelist/entities/filelist.entity';
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

    // @BeforeInsert() // 在插入前自动加密密码
    // async hashPassword() {
    //     if (this.password) {
    //         console.log(this.password, '6777666');
    //         const salt = await bcrypt.genSalt(10); // 生成盐
    //         this.password = await bcrypt.hash(this.password, salt); // 密码加密
    //     }
    // }
}
