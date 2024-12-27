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
}
