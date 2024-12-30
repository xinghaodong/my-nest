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

    findOne(id: number) {
        return `This action returns a #${id} orgManagement`;
    }

    update(id: number, updateOrgManagementDto: UpdateOrgManagementDto) {
        return `This action updates a #${id} orgManagement`;
    }

    async remove(id: number) {
        return await this.orgManagementRepository.delete({ organid: id });
    }
}
