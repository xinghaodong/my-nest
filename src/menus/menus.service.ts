import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { Menu } from './entities/menu.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type } from 'os';

@Injectable()
export class MenusService {
    @InjectRepository(Menu)
    private menuRepository: Repository<Menu>;
    async create(createMenuDto: CreateMenuDto): Promise<Menu> {
        const { parentId } = createMenuDto;

        // 创建新的菜单实例
        const menu = new Menu();
        console.log(menu, 'menu');
        // 使用 Object.assign 批量赋值
        Object.assign(menu, createMenuDto);

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
        console.log(menu, 'menu');
        return this.menuRepository.save(createMenuDto);
    }

    async findAll(): Promise<Menu[]> {
        let menus = await this.menuRepository.find();
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
        return await this.menuRepository.findOne({ where: { id } });
    }
}
