import { Role } from 'src/role/entities/role.entity';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Menu {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    url: string;

    @ManyToOne(() => Menu, menu => menu.children, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'parentId' })
    parent: Menu; // 父菜单

    @OneToMany(() => Menu, menu => menu.parent)
    children: Menu[]; // 子菜单列表

    @Column({ nullable: true })
    parentId: number | null;

    // 菜单组件地址
    @Column({ nullable: true })
    component: string;

    // 菜单图标
    @Column({ nullable: true })
    icon: string;

    // 是否缓存
    @Column({ nullable: true })
    keepalive: string;

    // 是否系统页面
    @Column({ nullable: true })
    vuepage: string;

    // 排序
    @Column({ nullable: false })
    sorts: number;

    // 资源编码
    @Column({ nullable: false })
    code: string;

    @ManyToMany(() => Role)
    @JoinTable() // 同样可以在 Menu 实体中使用 @JoinTable，表示这也是一个多对多关系
    roles: Role[];
}
