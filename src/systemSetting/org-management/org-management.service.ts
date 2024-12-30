import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateOrgManagementDto } from './dto/create-org-management.dto';
import { UpdateOrgManagementDto } from './dto/update-org-management.dto';
import { OrgManagement } from './entities/org-management.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class OrgManagementService {
    @InjectRepository(OrgManagement)
    private orgManagementRepository: Repository<OrgManagement>;
    async create(createOrgManagementDto: CreateOrgManagementDto) {
        // 增加判断 如果是菜单唯一编码重复了禁止添加
        if (await this.orgManagementRepository.findOne({ where: { orgcode: createOrgManagementDto.orgcode } })) {
            throw new HttpException('菜单唯一编码重复', HttpStatus.BAD_REQUEST);
        }
        return await this.orgManagementRepository.save(createOrgManagementDto);
    }

    async findAll() {
        return await this.orgManagementRepository.find();
    }

    // 详情
    async findOneById(organid: number): Promise<OrgManagement> {
        return await this.orgManagementRepository.findOneBy({ organid });
    }

    async update(organid: number, updateOrgManagementDto: UpdateOrgManagementDto) {}

    // 删除
    async remove(organid: number): Promise<void> {
        // return await this.orgManagementRepository.delete(organid);
        const result = await this.orgManagementRepository.delete(organid);
        if (result.affected === 0) {
            throw new HttpException('User not found', 404);
        }
    }
}
