import { Logger, BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Menu } from '../menus/entities/menu.entity';
import { console } from 'inspector';

@Injectable()
export class RoleService {
    constructor(
        @InjectRepository(Role)
        private usersRepository: Repository<Role>,
        @InjectRepository(Menu)
        private menuRepository: Repository<Menu>,
    ) {}
    // 验证角色名称是否重复
    private async validateUniqueRoleName(name: string) {
        console.log('验证角色名称是否重复', name);
        // 查询数据库中是否存在相同名称的角色
        // 如果存在，返回false，表示名称重复
        // 如果不存在，返回true，表示名称可用
        const existingRole = await this.usersRepository.findOneBy({ name });
        if (existingRole) {
            throw new HttpException('角色已存在', HttpStatus.BAD_REQUEST);
        }
    }
    /**
     * 分配菜单给角色
     * @param id 角色 ID
     * @param menuIds 菜单 ID 数组
     */
    async assignMenusToRole(id: number, menuIds: number[]): Promise<Role> {
        // 查找角色，加载其现有的菜单关系
        const role = await this.usersRepository.findOne({
            where: { id: id },
            relations: ['menus'], // 加载当前角色的菜单
        });

        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        let arr = menuIds;
        if (Array.isArray(menuIds)) {
            arr = menuIds.map(Number);
        }
        // 查询所有指定的菜单
        const menus = await this.menuRepository.find({
            where: { id: In(arr) }, // 使用 In 操作符代替 findByIds
        });

        if (menus.length !== menuIds.length) {
            throw new NotFoundException('部分菜单不存在');
        }
        // 将菜单分配给角色
        role.menus = menus;
        // 保存更新后的角色
        return this.usersRepository.save(role);
    }
    /**
     * 获取角色权限
     * @param id 角色 ID
     */
    async getRoleMenus(id: number): Promise<Menu[]> {
        const logger = new Logger('RoleService');

        // 查找角色，加载其现有的菜单关系
        const role = await this.usersRepository.findOne({
            where: { id: id },
            relations: ['menus'], // 加载当前角色的菜单
        });
        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        let arrIds = [];
        if (Array.isArray(role.menus) && role.menus.length > 0) {
            arrIds = role.menus.map(item => item.id);
        }
        // 返回角色的菜单列表
        return arrIds;
    }

    async create(createRoleDto: CreateRoleDto) {
        // 验证角色名称是否重复
        await this.validateUniqueRoleName(createRoleDto.name);
        const result = await this.usersRepository.save(createRoleDto);
        return result;
    }

    findAll() {
        return this.usersRepository.find();
    }

    findOne(id: number) {
        return this.usersRepository.findOneBy({ id: id });
    }

    // 详情
    async detail(id: number): Promise<Role> {
        return await this.usersRepository.findOneBy({ id: id });
    }

    async update(id: number, updateRoleDto: UpdateRoleDto) {
        // 验证角色名称是否重复
        // await this.validateUniqueRoleName(updateRoleDto.name);
        // 首先检查用户是否存在
        const existingRole = await this.findOne(id);
        console.log(existingRole, '666');

        console.log('updateRoleDto:', updateRoleDto);
        if (!existingRole) {
            throw new HttpException('角色不存在', 404);
        }
        // 删除 `id` 字段，确保不会覆盖主键
        delete updateRoleDto.id;
        // 合并有效字段到原有用户数据
        const updatedUser = Object.assign(existingRole, updateRoleDto);
        // 保存更新后的用户数据
        const result = await this.usersRepository.save(updatedUser);
        return result;
    }

    remove(id: number) {
        return `This action removes a #${id} role`;
    }
}
