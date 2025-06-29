import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Waypoint } from './waypoint.entity';

// 航线名称  航点数量 航线预估时间 状态 创建时间 更新时间
@Entity()
export class Cesium {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    pointNum: number;

    @Column()
    time: number;

    @Column()
    status: number;

    @CreateDateColumn({ type: 'timestamp' })
    created_at: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at: Date;

    @OneToMany(() => Waypoint, waypoint => waypoint.route)
    tempWaypoints: Waypoint[];
}
