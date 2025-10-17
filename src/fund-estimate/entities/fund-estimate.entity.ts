import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class FundEstimate {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ length: 255 })
    name: string;

    // 基金代码
    @Column({ length: 6 })
    code: string;

    @Column({ type: 'json', nullable: true })
    datas: Record<string, any>;

    //  是否查询成功
    // @Column({ type: 'boolean' })
    // success: boolean;

    // // 预估涨跌幅
    // @Column({ type: 'float' })
    // fundChangePct: number;
}
