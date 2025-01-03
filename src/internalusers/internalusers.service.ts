import { Injectable, HttpException, UploadedFile, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { CreateInternaluserDto } from './dto/create-internaluser.dto';
import { UpdateInternaluserDto } from './dto/update-internaluser.dto';
import { InternalUser } from './entities/internaluser.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindManyOptions, In } from 'typeorm';
import { FileList } from '../filelist/entities/filelist.entity';
import { Role } from 'src/role/entities/role.entity';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { OrgManagementService } from '../systemSetting/org-management/org-management.service';
import { plainToInstance } from 'class-transformer';

function formatUser(user: any) {
    return {
        ...user, // 保留用户的所有字段
    };
}
@Injectable()
export class InternalusersService {
    constructor(
        @InjectRepository(InternalUser)
        private usersRepository: Repository<InternalUser>,
        // 注入附件表
        @InjectRepository(FileList)
        private fileRepository: Repository<FileList>,
        // 角色表
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
        // 配置服务
        private readonly configService: ConfigService,
        // 注入组织服务
        private readonly orgManagementService: OrgManagementService, // 注入 OrgManagementService
    ) {}
    // 检测邮箱，账号是否存在
    async checkEmail(user, upateid: number): Promise<void> {
        const { email, username } = user;
        // 分别查找邮箱和用户名是否已存在
        const existingEmailUser = email
            ? await this.usersRepository.findOne({
                  where: { email },
              })
            : null;

        const existingUsernameUser = await this.usersRepository.findOne({
            where: { username },
        });

        // 检查邮箱或用户名是否已存在
        if (upateid === 0 && existingEmailUser) {
            throw new HttpException('邮箱已存在', HttpStatus.BAD_REQUEST);
        }

        if (upateid === 0 && existingUsernameUser) {
            throw new HttpException('账号已存在', HttpStatus.BAD_REQUEST);
        }

        if (upateid > 0) {
            if (existingEmailUser && existingEmailUser.id !== upateid) {
                throw new HttpException('邮箱已存在', HttpStatus.BAD_REQUEST);
            }
            if (existingUsernameUser && existingUsernameUser.id !== upateid) {
                throw new HttpException('账号已存在', HttpStatus.BAD_REQUEST);
            }
        }
    }

    async findByUsername(username: string): Promise<InternalUser | undefined> {
        return this.usersRepository.findOne({ where: { username } });
    }
    // 验证用户
    async validateUser(username: string, password: string): Promise<InternalUser | null> {
        const user = await this.findByUsername(username);
        // 如果没有找到用户或用户没有密码，则直接返回 null
        console.log('user', user.password, password, user);
        if (!user || !user.password) {
            throw new HttpException('用户或密码不正确', HttpStatus.INTERNAL_SERVER_ERROR);
        }
        // 确保传入的密码是明文字符串，而用户的密码是哈希密码
        const isPasswordValid = await bcrypt.compare(password, user.password);
        console.log('password match result:', isPasswordValid);
        if (isPasswordValid) {
            console.log('验证成功');
            return user; // 验证成功返回用户对象
        }

        console.log('密码验证失败');
        return null; // 验证失败返回 null
    }

    async findAll(page: number = 1, pageSize: number = 10): Promise<{ data: InternalUser[]; total: number }> {
        // 查出附件表中的 所有的附表   this.fileRepository
        // const fileList = await this.fileRepository.find();
        // console.log(page, pageSize, 'page, pageSize', fileList);
        const skip = (page - 1) * pageSize;
        const queryBuilder = this.usersRepository
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.avatar', 'avatar') // 加载关联的 avatar 信息
            .skip(skip)
            .take(pageSize);
        const [data, total] = await queryBuilder.getManyAndCount();
        // 使用 formatUser 函数处理每个用户的字段
        const formattedData = data.map(formatUser);
        return { data: formattedData, total };
    }
    async create(user: CreateInternaluserDto): Promise<InternalUser> {
        const logger = new Logger('InternalusersService');
        try {
            await this.checkEmail(user, 0);
            // 如果传了 avatars，则找到对应的 FileList 实体
            if (user.avatars) {
                const fileList = await this.fileRepository.findOne({ where: { id: user.avatars } });
                if (!fileList) {
                    throw new Error('未能找到对应的附件');
                }
                user.avatar = fileList; // 将 FileList 实体赋值给 avatar
            }
            // 关联组织
            const organization = await this.orgManagementService.findOne(user.organid);
            const { roleIds } = user;
            // 查找角色
            const roles = await this.roleRepository.find({ where: { id: In(roleIds) } });
            // 对密码进行加密
            user.password = this.configService.get<string>('DEFAULT_PASSWORD'); // 设置默认密码
            const hashedPassword = await bcrypt.hash(user.password, 10);
            user.password = hashedPassword;
            const newUser = this.usersRepository.create({ ...user, roles, organization });
            const result = await this.usersRepository.save(newUser); // 调用 save 方法
            return result;
        } catch (error) {
            throw new HttpException(`${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR); // 重新抛出错误，以便调用者知道失败原因
        }
    }
    // 更新用户
    async update(id: number, updateUserDto: UpdateInternaluserDto): Promise<InternalUser> {
        try {
            const logger = new Logger('InternalusersService');
            // 首先检查用户是否存在
            const existingUser = await this.findOne(id);
            if (!existingUser) {
                throw new HttpException('用户不存在', 404);
            }
            const { roleIds } = updateUserDto;
            if (roleIds) {
                const roles = await this.roleRepository.find({ where: { id: In(roleIds) } });
                existingUser.roles = roles;
                // updateUserDto.roleIds = roles.map(role => role.id) || [];
            }
            await this.checkEmail(updateUserDto, id);
            // 删除 `id` 字段，确保不会覆盖主键
            delete updateUserDto.id;
            if (!updateUserDto.avatars) {
                // 如果未传递 `avatars`，保留原有值
                delete updateUserDto.avatars;
            }
            // 查找角色
            // 合并有效字段到原有用户数据
            Object.assign(existingUser, updateUserDto);
            // logger.debug('updateUserDto', JSON.stringify(existingUser));
            // 保存更新后的用户数据
            // logger.warn('updateUserDto', JSON.stringify(existingUser));
            const result = await this.usersRepository.save(existingUser);
            return result;
        } catch (error) {
            throw new HttpException(`${error.message}`, 500);
        }
    }
    // 根据id查找人员实现controller里的findOne方法
    async findOne(id: number): Promise<InternalUser> {
        return this.usersRepository.findOneBy({
            id: id,
        });
    }
    // post 删除方法
    async remove(id: number): Promise<void> {
        const result = await this.usersRepository.delete(id);
        if (result.affected === 0) {
            throw new HttpException('User not found', 404);
        }
    }
    // 用户详情数据
    async findOneAll(id: number): Promise<InternalUser> {
        // 这里有两种方式加载关联的表数据
        // 1.使用 @Column 字段来存储外键 (organid)
        // 2.使用 @ManyToOne 来建立外键关系
        // 当前使用的是第1种
        const user = await this.usersRepository.findOne({
            where: { id },
            relations: ['roles', 'avatar'],
        });
        if (!user) {
            throw new HttpException('没找到用户', 404);
        }
        const roleIds = user.roles.map(item => item.id);
        delete user.roles;
        // 转换实体为 DTO，自动排除 password 字段
        const userDto = plainToInstance(InternalUser, user);
        // 手动查询组织信息（懒加载）
        // const organization = user.organid ? await this.orgManagementService.findOne(user.organid) : null;
        return {
            ...userDto,
            roleIds,
            organid: user.organid,
        };
    }

    /**
     * 根据用户id获取所属的
     * @param userId 用户 ID 查询属于的角色
     */
    async getRoleMenusByUserId(userId: number): Promise<Role[]> {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            relations: ['roles'], // 加载当前用户的角色
        });

        return user.roles;
    }
}
