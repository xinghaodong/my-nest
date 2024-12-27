import { Injectable } from '@nestjs/common';
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
        console.log('createOrgManagementDto:', createOrgManagementDto);
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

    remove(id: number) {
        return `This action removes a #${id} orgManagement`;
    }
}
