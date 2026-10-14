import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const TARGET_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'images');
const BASE_URL = 'https://raw.githubusercontent.com/pierotofy/drone_dataset_brighton_beach/master/images';
const TOTAL_IMAGES = 18; // DJI_0018.JPG 到 DJI_0035.JPG

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function run() {
  console.log('==============================================');
  console.log('📥 开始按需下载大疆官方航测测试数据集 (Brighton Beach)');
  console.log(`📁 目标存放路径: ${TARGET_DIR}`);
  console.log('==============================================\n');

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  for (let i = 18; i <= 35; i++) {
    const filename = `DJI_00${i}.JPG`;
    const dest = path.join(TARGET_DIR, filename);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) {
      console.log(`✔ [已存在] ${filename}`);
      continue;
    }
    const url = `${BASE_URL}/${filename}`;
    process.stdout.write(`⏳ 正在下载 ${filename} ... `);
    try {
      await downloadFile(url, dest);
      console.log('完成');
    } catch (err) {
      console.error(`失败: ${err.message}`);
    }
  }

  console.log('\n🎉 数据集准备完成！可用 read-exif.mjs 校验元数据或直接运行 build-3dtiles.mjs 进行建模。');
}

run().catch(console.error);
