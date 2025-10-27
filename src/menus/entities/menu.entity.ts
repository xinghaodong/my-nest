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

    // 资源类型 菜单 or 按钮
    @Column({ nullable: false })
    menutype: string;

    // 资源标识 perms
    @Column({ nullable: true })
    perms: string;

    @ManyToMany(() => Role, role => role.menus) // 确保这个指向 Role 实体的 menus 属性
    roles: Role[];
    roleIds: number[];

    // 增加一个字段 是否全屏 isscreen 字符串字段 默认是 1=>否 2=>是
    @Column({ nullable: true, default: '1' })
    isscreen: string;
}
