import { Injectable } from '@nestjs/common';
import { CreateCesiumDto } from './dto/create-cesium.dto';
import { UpdateCesiumDto } from './dto/update-cesium.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Cesium } from './entities/cesium.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CesiumService {
    constructor(
        @InjectRepository(Cesium)
        private cesiumRepository: Repository<Cesium>,
    ) {}
    async create(createCesiumDto: CreateCesiumDto) {
        console.log(createCesiumDto, '哈哈');
        // 存入数据库中
        const result = await this.cesiumRepository.save(createCesiumDto);
        return result;
    }

    async findAll(page: number, pageSize: number): Promise<{ list: Cesium[]; total: number }> {
        console.log(page, pageSize);

        const [list, total] = await this.cesiumRepository.findAndCount({
            skip: (page - 1) * pageSize, // 跳过的数据量
            take: pageSize, // 每页取出的数据量
        });
        return { list: list, total }; // 返回查询结果和总记录数
    }

    findOne(id: number) {
        return `This action returns a #${id} cesium`;
    }

    update(id: number, updateCesiumDto: UpdateCesiumDto) {
        return `This action updates a #${id} cesium`;
    }

    remove(id: number) {
        return `This action removes a #${id} cesium`;
    }
}
