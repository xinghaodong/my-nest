import { Logger, BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Menu } from '../menus/entities/menu.entity';

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
        // 查询数据库中是否存在相同名称的角色
        // 如果存在，返回false，表示名称重复
        // 如果不存在，返回true，表示名称可用
        const existingRole = await this.usersRepository.findOneBy({ name });
        if (existingRole) {
            throw new HttpException('角色已存在', HttpStatus.BAD_REQUEST);
        }
    }
    /**
     * 根据用户id获取所属的菜单
     * @param userId 用户 ID
     */
    // : Promise<Menu[]>
    async getRoleMenusByUserId(userId: number) {
        // 查找用户，加载其现有的角色关系
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            relations: ['roles'], // 加载当前用户的角色
        });

        if (!user) {
            throw new NotFoundException('用户不存在');
        }

        // // 获取用户的角色 ID 数组
        // const roleIds = user.roles.map(role => role.id);

        // // // 根据角色 ID 数组获取菜单
        // const menus = await this.menuRepository.find({
        //     where: { roleId: In(roleIds) }, // 使用In 操作符代替 findByIds
        // });
        // return menus;
    }
    /**
     * 分配菜单给角色
     * @param id 角色 ID
     * @param menuIds 菜单 ID 数组
     */
    async assignMenusToRole(id: number, menuIds: number[]): Promise<Role> {
        // 确保 menuIds 为数组
        const processedMenuIds = Array.isArray(menuIds) ? menuIds : [];
        // 查找角色，加载其现有的菜单关系
        const role = await this.usersRepository.findOne({
            where: { id: id },
            relations: ['menus'], // 加载当前角色的菜单
        });

        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        // if (processedMenuIds.length > 0) {
        // 查询所有指定的菜单
        const menus = await this.menuRepository.find({
            where: { id: In(processedMenuIds) },
        });
        // 将菜单分配给角色
        role.menus = menus;
        // }
        // 保存更新后的角色
        return this.usersRepository.save(role);
    }

    /**
     * 获取角色权限
     * @param id 角色 ID
     */
    async getRoleMenus(id: number): Promise<Menu[]> {
        // 查找角色，加载其现有的菜单关系
        const role = await this.usersRepository.findOne({
            where: { id: id },
            relations: ['menus'], // 加载当前角色的菜单
        });
        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        console.log('role.menus', role);
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
        console.log('findAll');
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

    /**
     * 根据角色id数组获取对应的菜单
     */
    async getMenuIdsByRoleIds(roleIds: number[]): Promise<number[]> {
        // 查找角色，加载其现有的菜单关系
        const roles = await this.usersRepository.find({
            where: { id: In(roleIds) },
            relations: ['menus'], // 加载当前角色的菜单
        });
        if (!roles || roles.length === 0) {
            throw new NotFoundException('角色数组是空');
        }
        // 获取角色对应的菜单权限
        const menuIds = roles.flatMap(role => role.menus.map(menu => menu.id));
        return menuIds;
    }

    // 新增一个方法：通过角色 ID 获取角色实体
    async getRolesByIds(roleIds: number[]): Promise<Role[]> {
        const roles = await this.usersRepository.find({
            where: { id: In(roleIds) },
        });
        if (!roles || roles.length !== roleIds.length) {
            throw new NotFoundException('部分角色不存在');
        }
        return roles;
    }
}
