import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ProcessTemplate {
    @PrimaryGeneratedColumn()
    id: number; // 主键 ID

    @Column()
    name: string; // 流程名称

    @Column()
    code: string; // 流程编码

    @Column('json')
    nodes: {
        id: string;
        type: string;
        initialized: boolean;
        position: {
            x: number | string;
            y: number | string;
        };
        data: {
            label: string;
        };
    }[]; // 节点数组

    @Column('json')
    edges: {
        id: string;
        type: string;
        source: string;
        target: string;
        sourceHandle: string | null;
        targetHandle: string | null;
        data: any; // 具体结构根据业务需要定制，当前使用 any
        label: string;
        sourceX: number | string;
        sourceY: number | string;
        targetX: number | string;
        targetY: number | string;
    }[]; // 边数组

    @Column('json')
    position: [number | string, number | string]; // 画布位置

    @Column('decimal', { precision: 20, scale: 15 })
    zoom: number | string; // 缩放比例，存储为字符串以避免精度丢失
}
