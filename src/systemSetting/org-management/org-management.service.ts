import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateOrgManagementDto } from './dto/create-org-management.dto';
import { UpdateOrgManagementDto } from './dto/update-org-management.dto';
import { OrgManagement } from './entities/org-management.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

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
        let menus = await this.orgManagementRepository.find();
        const result = [];
        menus.forEach(menu => {
            if (menu.parentId === null) {
                result.push(menu);
            } else {
                // 如果有父菜单，找到它并将当前菜单添加到父菜单的 children 数组中
                const parent = menus.find(m => m.organid === menu.parentId);
                if (parent) {
                    if (!parent.children) {
                        parent.children = [];
                    }
                    parent.children.push(menu);
                }
            }
        });
        return result;

        // return await this.orgManagementRepository.find();
    }

    // 详情
    async findOneById(organid: number): Promise<OrgManagement> {
        // return await this.orgManagementRepository.findOneBy({ organid });
        // 查询组织信息并且同时加载员工列表
        const organization = await this.orgManagementRepository.findOne({
            where: { organid },
            relations: ['employees'], // 自动加载员工列表
        });

        if (!organization) {
            throw new HttpException('没有找到该组织', 404);
        }
        // 返回组织信息及其员工列表
        return organization;
    }

    async findOne(id: number): Promise<OrgManagement> {
        return await this.orgManagementRepository.findOneBy({ organid: id });
    }

    async update(organid: number, updateOrgManagementDto: UpdateOrgManagementDto) {
        const obj = await this.findOne(organid);
        if (!obj) {
            throw new HttpException('不存在', 404);
        }
        const existingOrg = await this.orgManagementRepository.findOne({
            where: {
                orgcode: updateOrgManagementDto.orgcode,
                organid: Not(organid),
            },
        });
        // 删除updateOrgManagementDto 的 organid
        delete updateOrgManagementDto.organid;

        if (existingOrg) {
            throw new HttpException('菜单唯一编码重复', HttpStatus.BAD_REQUEST);
        }
        // 合并有效字段到原有用户数据
        const updated = Object.assign(obj, updateOrgManagementDto);
        // 保存更新后的用户数据
        const result = await this.orgManagementRepository.save(updated);
        return result;
    }

    // 删除
    async remove(organid: number): Promise<void> {
        // return await this.orgManagementRepository.delete(organid);
        const result = await this.orgManagementRepository.delete(organid);
        if (result.affected === 0) {
            throw new HttpException('未找到组织', 404);
        }
    }
}
