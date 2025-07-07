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
        if (createCesiumDto.tempWaypoints && createCesiumDto.tempWaypoints.length > 0) {
            // 先判断航线名称是否有重复的
            const existingCesium = await this.cesiumRepository.findOneBy({ name: createCesiumDto.name });
            if (existingCesium) {
                throw new HttpException('航线名称已存在', HttpStatus.BAD_REQUEST);
            }
            const cesiumEntity = this.cesiumRepository.create({
                ...createCesiumDto,
                tempWaypoints: undefined, // 先排除航点，后面单独处理
            });
            const savedCesium = await this.cesiumRepository.save(cesiumEntity);
            const tempWaypoints = createCesiumDto.tempWaypoints.map((waypointDto, index) => {
                return this.waypointRepository.create({
                    latitude: waypointDto.latitude,
                    longitude: waypointDto.longitude,
                    height: waypointDto.height,
                    route: savedCesium, // 使用正确的关联关系
                });
            });
            await this.waypointRepository.save(tempWaypoints);
            // 3. 返回完整数据（包含航点）
            return this.cesiumRepository.findOne({
                where: { id: cesiumEntity.id },
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

    async update(id: number, updateCesiumDto: UpdateCesiumDto) {
        const { tempWaypoints, ...updateData } = updateCesiumDto;
        // 这种可以增加事务
        // 1. 更新主表 Cesium（排除 tempWaypoints）
        await this.cesiumRepository.update(id, updateData);

        // 2. 查询主表实体用于设置外键
        const cesium = await this.cesiumRepository.findOneBy({ id });
        if (!cesium) {
            throw new HttpException('未找到航线', HttpStatus.NOT_FOUND);
        }

        // 3. 删除旧的航点
        await this.waypointRepository.delete({ route: { id } });

        // 4. 插入新的航点（如果存在）
        if (tempWaypoints && tempWaypoints.length > 0) {
            const waypointEntities = tempWaypoints.map(dto =>
                this.waypointRepository.create({
                    latitude: dto.latitude,
                    longitude: dto.longitude,
                    height: dto.height,
                    route: cesium, // 设置关联关系
                }),
            );
            await this.waypointRepository.save(waypointEntities);
        }

        // 5. 返回更新后的完整数据
        return this.cesiumRepository.findOne({
            where: { id },
            relations: ['tempWaypoints'],
        });
    }

    async remove(id: number) {
        const result = await this.cesiumRepository.delete(id);
        if (result.affected === 0) {
            throw new HttpException('未找到航线', 404);
        }
    }
}
