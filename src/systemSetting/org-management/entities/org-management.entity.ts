import { InternalUser } from '@/src/internalusers/entities/internaluser.entity';
import { IsNotEmpty } from 'class-validator';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class OrgManagement {
    @PrimaryGeneratedColumn()
    organid: number;

    @Column()
    @IsNotEmpty()
    organame: string;

    @Column()
    @IsNotEmpty()
    orgcode: string;

    @ManyToOne(() => OrgManagement, menu => menu.children, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'parentId' })
    parent: OrgManagement; // 父

    @OneToMany(() => OrgManagement, menu => menu.parent)
    children: OrgManagement[]; // 子列表

    @Column({ nullable: true })
    parentId: number | null;

    // 纳税人识别号 / 统一社会信用代码 (公司主体专属)
    @Column({ nullable: true, length: 32 })
    taxCode: string;

    // 公司法定全称 (开票抬头专属，不填则默认取 organame)
    @Column({ nullable: true, length: 128 })
    legalEntityName: string;

    // 组织类型: company(公司法人主体) | dept(业务部门/小组)
    @Column({ nullable: true, default: 'dept', length: 32 })
    orgType: string;

    @OneToMany(() => InternalUser, user => user.organization) // 一对多关系
    employees: InternalUser[]; // 组织的员工列表
}
