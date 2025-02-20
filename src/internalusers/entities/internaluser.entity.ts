import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { FileList } from '../../filelist/entities/filelist.entity';
import { Role } from '../../role/entities/role.entity';
import { IsEmail } from 'class-validator';
import { OrgManagement } from '@/src/systemSetting/org-management/entities/org-management.entity';
import { Exclude, Expose } from 'class-transformer';

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
    @Exclude()
    password: string;

    // 邮箱
    @Column()
    @IsEmail() // 验证格式是否为有效 email
    email: string;

    // 主题
    @Column({ nullable: false, default: 'light' })
    theme: string;

    // 绑定附件表的 id
    @ManyToOne(() => FileList, { nullable: true }) // 可为空
    @JoinColumn({ name: 'avatar_id' })
    avatar: FileList | null = null;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;

    // 关联的角色表
    @ManyToMany(() => Role)
    @JoinTable()
    roles: Role[];

    roleIds?: number[];

    // 关联的组织表
    @ManyToOne(() => OrgManagement, { nullable: true })
    @JoinColumn({ name: 'organid' }) // 组织的外键字段
    organization: OrgManagement;

    // 组织 ID 字段
    @Column({ nullable: true })
    organid: number; // 直接使用外键 `organid` 字段
}
