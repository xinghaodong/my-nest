import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cesium } from './cesium.entity';
@Entity()
export class Waypoint {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('decimal', { precision: 18, scale: 15 })
    latitude: number;

    @Column('decimal', { precision: 18, scale: 15 })
    longitude: number;

    // 高度
    @Column()
    height: number;

    @ManyToOne(() => Cesium, cesium => cesium.tempWaypoints, {
        onDelete: 'CASCADE', // 数据库级联删除
        cascade: ['insert'], // 只自动保存新航线
    })
    route: Cesium;
}
