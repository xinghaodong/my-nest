import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileList } from './entities/filelist.entity';

@Injectable()
export class FilelistService {
    constructor(
        @InjectRepository(FileList)
        private fileListRepository: Repository<FileList>,
    ) {}
    async saveFile(file: FileList): Promise<FileList> {
        return this.fileListRepository.save(file);
    }
    async previewFiles(files: string): Promise<FileList[]> {
        return this.fileListRepository.find();
    }

    async findById(id: number) {
        try {
            const file = this.fileListRepository.findOneBy({ id });
            console.log(file);
            // const formDesign = await this.logicFlowRepository.findOneBy({ id });
            console.log(file);
            return file;
        } catch (error) {
            return error;
        }
    }
}
