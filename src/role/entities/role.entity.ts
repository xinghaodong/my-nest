import { InternalUser } from 'src/internalusers/entities/internaluser.entity';
import { Menu } from 'src/menus/entities/menu.entity';
import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Role {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    // 是否有效
    @Column()
    states: number;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;

    @ManyToMany(() => Menu, menu => menu.roles, { cascade: ['insert', 'update', 'remove'] }) // 仅设置插入和更新级联
    @JoinTable() // 这个装饰器会告诉 TypeORM 需要创建中间表
    menus: Menu[];

    @ManyToMany(() => InternalUser)
    @JoinTable()
    users: InternalUser[];
}
