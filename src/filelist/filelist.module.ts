import { Global, Module } from '@nestjs/common';
import { FilelistService } from './filelist.service';
import { FilelistController } from './filelist.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileList } from './entities/filelist.entity';
import { InternalUser } from '../internalusers/entities/internaluser.entity';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
@Global()
@Module({
    imports: [
        MulterModule.register({
            limits: { fileSize: 1024 * 1024 * 5 },
            storage: diskStorage({
                destination: (req, file, cb) => {
                    const uploadPath = './uploads';
                    if (!fs.existsSync(uploadPath)) {
                        fs.mkdirSync(uploadPath, { recursive: true });
                    }
                    cb(null, uploadPath);
                },
                filename: (req, file, cb) => {
                    const filename = `${uuidv4()}-${file.originalname}`;
                    cb(null, filename);
                },
            }),
        }),
        TypeOrmModule.forFeature([InternalUser, FileList]),
    ],
    controllers: [FilelistController],
    providers: [FilelistService],
    exports: [TypeOrmModule.forFeature([FileList]), FilelistService],
})
export class FilelistModule {}
