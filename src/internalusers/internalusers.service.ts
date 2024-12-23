import { Injectable, HttpException, UploadedFile, HttpStatus } from '@nestjs/common';
import { CreateInternaluserDto } from './dto/create-internaluser.dto';
import { UpdateInternaluserDto } from './dto/update-internaluser.dto';
import { InternalUser } from './entities/internaluser.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindManyOptions } from 'typeorm';
import { FileList } from '../filelist/entities/filelist.entity';
import * as bcrypt from 'bcryptjs';

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
    ) {}
    // 检测邮箱，账号是否存在
    async checkEmail(user: InternalUser, upateid: number): Promise<void> {
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
            throw new HttpException('用户或密码不正确1', HttpStatus.INTERNAL_SERVER_ERROR);
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
        try {
            await this.checkEmail(user as InternalUser, 0);
            // 如果传了 avatars，则找到对应的 FileList 实体
            if (user.avatars) {
                const fileList = await this.fileRepository.findOne({ where: { id: user.avatars } });
                if (!fileList) {
                    throw new Error('未能找到对应的附件');
                }
                user.avatar = fileList; // 将 FileList 实体赋值给 avatar
            }
            // 对密码进行加密
            user.password = '888888'; // 设置默认密码
            const hashedPassword = await bcrypt.hash(user.password, 10);
            user.password = hashedPassword;
            const newUser = this.usersRepository.create(user);
            const result = await this.usersRepository.save(newUser); // 调用 save 方法
            return result;
        } catch (error) {
            throw new HttpException(`${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR); // 重新抛出错误，以便调用者知道失败原因
        }
    }
    // 更新用户
    async update(id: number, updateUserDto: UpdateInternaluserDto): Promise<InternalUser> {
        try {
            // 首先检查用户是否存在
            const existingUser = await this.findOne(id);
            if (!existingUser) {
                throw new HttpException('用户不存在', 404);
            }
            await this.checkEmail(updateUserDto as InternalUser, id);
            // 删除 `id` 字段，确保不会覆盖主键
            delete updateUserDto.id;
            if (!updateUserDto.avatars) {
                // 如果未传递 `avatars`，保留原有值
                delete updateUserDto.avatars;
            }
            // 合并有效字段到原有用户数据
            const updatedUser = Object.assign(existingUser, updateUserDto);
            // 保存更新后的用户数据
            const result = await this.usersRepository.save(updatedUser);
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
}
