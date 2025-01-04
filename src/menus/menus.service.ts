import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { Menu } from './entities/menu.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service'; // 引入 AuthService
import { RoleService } from '../role/role.service';
import { InternalusersService } from '../internalusers/internalusers.service';

@Injectable()
export class MenusService {
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>;
    constructor(
        private readonly authService: AuthService,
        private readonly roleService: RoleService, // 注入 RoleService
        private readonly internalusersService: InternalusersService,
    ) {}
    async create(createMenuDto: CreateMenuDto): Promise<Menu> {
        const { parentId, roleIds } = createMenuDto;

        // 创建新的菜单实例
        const menu = new Menu();
        console.log(menu, 'menu');
        // 使用 Object.assign 批量赋值
        Object.assign(menu, createMenuDto);
        // 增加判断 如果是菜单唯一编码重复了禁止添加
        if (await this.menuRepository.findOne({ where: { code: menu.code } })) {
            throw new HttpException('菜单唯一编码重复', HttpStatus.BAD_REQUEST);
        }
        // 如果传入了 parentId，设置父菜单
        if (parentId) {
            const parentMenu = await this.findOne(parentId);
            if (parentMenu) {
                menu.parent = parentMenu; // 设置父菜单
                menu.parentId = parentMenu.id;
            } else {
                throw new Error('找不到父菜单'); // 如果找不到父菜单，抛出错误
            }
        }
        // 处理角色关联
        if (roleIds && roleIds.length > 0) {
            // 查询所有指定的角色
            const roles = await this.roleService.getRolesByIds(roleIds);
            if (roles.length !== roleIds.length) {
                throw new HttpException('部分角色不存在', HttpStatus.BAD_REQUEST);
            }
            menu.roles = roles; // 设置关联角色
        }

        return this.menuRepository.save(createMenuDto);
    }

    async findAll(req: any): Promise<Menu[]> {
        // 从请求头获取 token
        const token = req.headers['authorization']?.split(' ')[1]; // 如果是 Bearer token 格式
        if (!token) {
            throw new NotFoundException('Token not found');
        }
        // 解码 token 获取 userId
        let userId = null;
        const decoded = this.authService.decode(token) as { sub: number };
        userId = decoded.sub;
        let menus = [];

        // 获取用户所属的角色
        const roles = await this.internalusersService.getRoleMenusByUserId(userId);
        if (!roles || roles.length === 0) {
            throw new NotFoundException('没有找到用户对应的角色');
        }
        // 如果不存在超级管理员角色，就获取当前用户的菜单权限
        if (roles.some(role => role.name !== '超级管理员')) {
            // 获取角色对应的菜单权限
            const menuIds = await this.roleService.getMenuIdsByRoleIds(roles.map(role => role.id));
            if (!menuIds || menuIds.length === 0) {
                throw new NotFoundException('没有找到用户角色的菜单权限');
            }
            // 获取所有菜单，过滤出当前角色有权限的菜单
            menus = await this.menuRepository.find({ where: { id: In(menuIds) } });
        } else {
            // 存在超管角色 查所有
            menus = await this.menuRepository.find();
        }
        // 按照 sorts 字段对菜单进行升序排序
        menus = menus.sort((a, b) => a.sorts - b.sorts);
        // 创建一个结果数组，用来存储树形结构
        const result = [];
        // 遍历所有菜单并构建树形结构
        menus.forEach(menu => {
            // 如果没有父菜单（即 parentId 为 null），它是根菜单
            if (menu.parentId === null) {
                result.push(menu);
            } else {
                // 如果有父菜单，找到它并将当前菜单添加到父菜单的 children 数组中
                const parent = menus.find(m => m.id === menu.parentId);
                if (parent) {
                    if (!parent.children) {
                        parent.children = [];
                    }
                    parent.children.push(menu);
                }
            }
        });
        return result;
    }

    async findOne(parentId: number): Promise<Menu> {
        return await this.menuRepository.findOne({ where: { id: parentId } });
    }
    // 修改菜单
    async update(id: number, updateMenuDto: UpdateMenuDto): Promise<Menu> {
        console.log('updateMenuDto in service:', updateMenuDto);
        const menuItem = await this.menuRepository.findOne({ where: { id } });
        if (!menuItem) {
            throw new HttpException('菜单不存在', 404);
        }
        // 删除id
        delete updateMenuDto.id;
        const updateMenuItem = Object.assign(menuItem, updateMenuDto);
        // 增加判断 如果是菜单唯一编码重复了禁止添加
        // if (await this.menuRepository.findOne({ where: { code: updateMenuDto.code } })) {
        //     throw new HttpException('菜单唯一编码重复', HttpStatus.BAD_REQUEST);
        // }
        // 检查是否存在其他记录的编码与 updateMenuDto.code 相同
        const existingMenu = await this.menuRepository.findOne({
            where: {
                code: updateMenuDto.code,
                id: Not(id), // 排除当前正在更新的记录
            },
        });
        if (existingMenu) {
            throw new HttpException('菜单唯一编码重复', HttpStatus.BAD_REQUEST);
        }
        return this.menuRepository.save(updateMenuItem);
    }
    // 删除菜单
    async remove(id: number): Promise<void> {
        const result = await this.menuRepository.delete(id);
        if (result.affected === 0) {
            throw new HttpException('未找到菜单', 404);
        }
    }
    // 详情接口
    async detail(id: number): Promise<Menu> {
        return await this.menuRepository.findOne({
            where: { id },
            relations: ['roles'], // 加载关联的角色表
        });
    }
}
