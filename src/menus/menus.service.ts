import { forwardRef, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { Menu } from './entities/menu.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository, IsNull } from 'typeorm';
import { AuthService } from '../auth/auth.service'; // 引入 AuthService
import { RoleService } from '../role/role.service';
import { InternalusersService } from '../internalusers/internalusers.service';

@Injectable()
export class MenusService {
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>;
    constructor(
        @Inject(forwardRef(() => AuthService)) // 在里需要使用 forwardRef 解决循环依赖问题
        private readonly authService: AuthService,
        private readonly roleService: RoleService, // 注入 RoleService
        private readonly internalusersService: InternalusersService,
    ) {}
    async create(createMenuDto: CreateMenuDto): Promise<Menu> {
        const { parentId, roleIds } = createMenuDto;

        // 创建新的菜单实例
        const menu = new Menu();
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

        // 级联保存菜单及其角色关联
        const savedMenu = await this.menuRepository.save(menu);

        return savedMenu;
    }

    /**
     * 获取用户的按钮权限
     * @param id
     * @returns
     */
    async getPermsByUserId(id: number): Promise<any> {
        let menus = [];
        // 获取用户所属的角色
        const roles = await this.internalusersService.getRoleMenusByUserId(id);
        if (!roles || roles.length === 0) {
            throw new NotFoundException('没有找到用户对应的角色');
        }
        // 如果不存在超级管理员角色，就获取当前用户的菜单权限
        if (roles.some(role => role.name !== '超级管理员')) {
            // 获取角色对应的菜单权限
            const menuIds = await this.roleService.getMenuIdsByRoleIds(roles.map(role => role.id));
            // 获取所有菜单，过滤出当前角色有权限的菜单
            menus = await this.menuRepository.find({ where: { id: In(menuIds) } });
        } else {
            // 存在超管角色 查所有
            menus = await this.menuRepository.find();
        }
        // 过滤掉 menutype == 1
        menus = menus.filter(menu => menu.menutype == 2);
        const perms = menus.map(menu => menu.perms);
        return perms;
        // return { perms: roles.perms };
    }

    async findAll(req: any): Promise<Menu[]> {
        const { type } = req.query;
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
            // 获取所有菜单，过滤出当前角色有权限的菜单
            menus = await this.menuRepository.find({ where: { id: In(menuIds) } });
        } else {
            // console.log('当前账号存在超管角色');
            // 存在超管角色 查所有
            menus = await this.menuRepository.find();
        }
        // 前端掺入type:1 把按钮类型的资源过滤掉
        if (type == 1) {
            menus = menus.filter(item => item.menutype != 2);
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
        const menuItem = await this.menuRepository.findOne({ where: { id } });
        if (!menuItem) {
            throw new HttpException('菜单不存在', 404);
        }

        // 删除id
        delete updateMenuDto.id;

        // 检查菜单唯一编码是否重复
        const existingMenu = await this.menuRepository.findOne({
            where: {
                code: updateMenuDto.code,
                id: Not(id), // 排除当前正在更新的记录
            },
        });
        if (existingMenu) {
            throw new HttpException('菜单唯一编码重复', HttpStatus.BAD_REQUEST);
        }
        // 处理角色关联
        if (updateMenuDto.roleIds && updateMenuDto.roleIds.length > 0) {
            // 查询所有指定的角色
            const roles = await this.roleService.getRolesByIds(updateMenuDto.roleIds);
            if (roles.length !== updateMenuDto.roleIds.length) {
                throw new HttpException('部分角色不存在', HttpStatus.BAD_REQUEST);
            }
            // 添加新的角色
            menuItem.roles = roles; // 更新角色关联
        } else {
            menuItem.roles = []; // 清空原有的角色关联
        }
        // 使用 Object.assign 更新字段
        const updatedMenuItem = Object.assign(menuItem, updateMenuDto);
        // 保存更新后的菜单
        return this.menuRepository.save(updatedMenuItem);
    }
    // 删除菜单
    async remove(id: number): Promise<void> {
        // 删除中间表中的关联数据 这里中间表没有实体就用sql语句删除
        await this.menuRepository.query('DELETE FROM role_menus_menu WHERE menuId = ?', [id]);
        const result = await this.menuRepository.delete(id);
        if (result.affected === 0) {
            throw new HttpException('未找到菜单', 404);
        }
    }
    // 详情接口
    async detail(id: number): Promise<Menu> {
        const menu = await this.menuRepository
            .createQueryBuilder('menu')
            .leftJoinAndSelect('menu.roles', 'role') // 手动加载角色
            .where('menu.id = :id', { id })
            .getOne();

        if (menu && menu.roles) {
            // 添加 roleIds 属性到结果对象中
            menu.roleIds = menu.roles.map(role => role.id);
            delete menu.roles;
        } else {
            menu.roleIds = []; // 如果没有角色，则返回空数组
        }

        return menu;
    }

    async getMenusByPid(pid: number | null): Promise<Menu[]> {
        return await this.menuRepository.find({
            where: { parentId: !pid ? IsNull() : pid },
            order: { sorts: 'ASC', id: 'ASC' },
        });
    }
}
