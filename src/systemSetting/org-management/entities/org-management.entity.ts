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

    @OneToMany(() => InternalUser, user => user.organization) // 一对多关系
    employees: InternalUser[]; // 组织的员工列表
}
