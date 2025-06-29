import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateCesiumDto } from './dto/create-cesium.dto';
import { UpdateCesiumDto } from './dto/update-cesium.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Cesium } from './entities/cesium.entity';
import { Repository } from 'typeorm';
import { Waypoint } from './entities/waypoint.entity';

@Injectable()
export class CesiumService {
    constructor(
        @InjectRepository(Cesium)
        private cesiumRepository: Repository<Cesium>,

        @InjectRepository(Waypoint)
        private waypointRepository: Repository<Waypoint>,
    ) {}
    async create(createCesiumDto: CreateCesiumDto) {
        // 这里关联 waypoint 航点表

        // 2. 如果有航点数据，创建关联航点
        if (createCesiumDto.tempWaypoints && createCesiumDto.tempWaypoints.length > 0) {
            // 1. 创建航线记录
            const cesium = await this.cesiumRepository.save({
                name: createCesiumDto.name,
                time: createCesiumDto.time,
                pointNum: createCesiumDto.pointNum,
                status: createCesiumDto.status,
            });
            const tempWaypoints = createCesiumDto.tempWaypoints.map((waypointDto, index) => {
                return this.waypointRepository.create({
                    latitude: waypointDto.latitude,
                    longitude: waypointDto.longitude,
                    height: waypointDto.height,
                    route: cesium, // 使用正确的关联关系
                });
            });
            await this.waypointRepository.save(tempWaypoints);
            // 3. 返回完整数据（包含航点）
            return this.cesiumRepository.findOne({
                where: { id: cesium.id },
                relations: ['tempWaypoints'],
            });
        } else {
            // 抛异常
            throw new HttpException('请创建航点', HttpStatus.NOT_FOUND);
        }
    }

    async findAll(page: number, pageSize: number): Promise<{ list: Cesium[]; total: number }> {
        console.log(page, pageSize);
        const [list, total] = await this.cesiumRepository.findAndCount({
            skip: (page - 1) * pageSize, // 跳过的数据量
            take: pageSize, // 每页取出的数据量
        });
        return { list: list, total }; // 返回查询结果和总记录数
    }

    async findOne(id: number) {
        // 查询航线详情 航点数据
        const cesium = await this.cesiumRepository.findOne({
            where: { id },
            relations: ['tempWaypoints'],
        });
        return cesium;
    }

    update(id: number, updateCesiumDto: UpdateCesiumDto) {
        // return `This action updates a #${id} cesium`;
    }

    async remove(id: number) {
        const result = await this.cesiumRepository.delete(id);
        if (result.affected === 0) {
            throw new HttpException('未找到航线', 404);
        }
    }
}
