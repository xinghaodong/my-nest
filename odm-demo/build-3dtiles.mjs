import fs from 'node:fs';
import path from 'node:path';

// 支持通过环境变量指定，使用 127.0.0.1 避免 Windows IPv6(::1) EACCES 错误，端口 3050
const ODM_URL = process.env.ODM_URL || 'http://127.0.0.1:3050';
const CURRENT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// 灵活识别相片目录：支持命令行指定、默认 images 目录、降级 img 目录
function resolveImagesDir() {
  if (process.argv[2] && fs.existsSync(process.argv[2])) {
    return path.resolve(process.argv[2]);
  }
  const defaultDir = path.join(CURRENT_DIR, 'images');
  if (fs.existsSync(defaultDir) && fs.readdirSync(defaultDir).some(f => /\.(jpe?g)$/i.test(f))) {
    return defaultDir;
  }
  const fallbackDir = path.join(CURRENT_DIR, 'img');
  if (fs.existsSync(fallbackDir) && fs.readdirSync(fallbackDir).some(f => /\.(jpe?g)$/i.test(f))) {
    return fallbackDir;
  }
  return defaultDir;
}

const IMAGES_DIR = resolveImagesDir();
const LOCAL_DATA_DIR = path.join(CURRENT_DIR, 'odm_data');


async function runMinimalReconstruction() {
  console.log('==============================================');
  console.log('🚀 开始执行三维重建最小闭环 Demo (RTX 3060 GPU 极速模式)');
  console.log(`🔗 目标 NodeODM 引擎地址: ${ODM_URL}`);
  console.log(`📁 读取图片目录: ${IMAGES_DIR}`);
  console.log('==============================================\n');

  // 1. GPU 极速参数配置（专为快速生成 3D Tiles 优化）
  const options = [
    { name: '3d-tiles', value: true },          // 核心：强制输出 Cesium 3D Tiles
    { name: 'use-exif', value: true },          // 提取照片内嵌的 POS/GPS 坐标
    { name: 'feature-quality', value: 'low' },  // 特征点抽取设为 low，大幅减少 CPU 计算量
    { name: 'pc-quality', value: 'lowest' },    // 密集点云降到最低，省内存且防 OOM
    { name: 'mesh-octree-depth', value: 8 },    // 降低网格细分层级（默认11），快速成网
    { name: 'skip-orthophoto', value: true },   // 跳过二维正射影像拼接，纯粹只出三维模型
  ];

  // 2. 初始化建模任务 (/task/new/init)
  console.log('步骤 [1/4]: 正在向引擎初始化建模任务...');
  const initForm = new FormData();
  initForm.append('name', 'demo_minimal_task');
  initForm.append('options', JSON.stringify(options));

  const initRes = await fetch(`${ODM_URL}/task/new/init`, {
    method: 'POST',
    body: initForm,
  });
  if (!initRes.ok) throw new Error(`任务初始化失败: ${initRes.status} ${initRes.statusText}`);
  const { uuid } = await initRes.json();
  console.log(`✔ 任务初始化成功，任务 UUID: ${uuid}\n`);

  // 3. 上传本地图片 (/task/new/upload/{uuid})
  if (!fs.existsSync(IMAGES_DIR)) {
    throw new Error(`目录不存在: ${IMAGES_DIR}，请先创建并放入照片！`);
  }
  const imageFiles = fs.readdirSync(IMAGES_DIR).filter((f) => /\.(jpe?g)$/i.test(f));
  if (imageFiles.length === 0) {
    throw new Error(`images 文件夹中没有找到 JPG 照片！请先将照片放入: ${IMAGES_DIR}`);
  }

  console.log(`步骤 [2/4]: 正在上传 ${imageFiles.length} 张航拍测试图...`);
  const uploadForm = new FormData();
  for (const file of imageFiles) {
    const fileBuffer = fs.readFileSync(path.join(IMAGES_DIR, file));
    uploadForm.append('images', new Blob([fileBuffer]), file);
  }

  const uploadRes = await fetch(`${ODM_URL}/task/new/upload/${uuid}`, {
    method: 'POST',
    body: uploadForm,
  });
  if (!uploadRes.ok) throw new Error(`图片上传失败: ${uploadRes.status} ${uploadRes.statusText}`);
  console.log(`✔ 图片上传完成\n`);

  // 4. 提交并启动 CPU 重建 (/task/new/commit/{uuid})
  console.log('步骤 [3/4]: 正在启动三维重建引擎...');
  const commitRes = await fetch(`${ODM_URL}/task/new/commit/${uuid}`, {
    method: 'POST',
  });
  if (!commitRes.ok) throw new Error(`任务启动失败: ${commitRes.status} ${commitRes.statusText}`);
  console.log('✔ 已正式启动 CPU 重建，开始轮询进度...\n');

  // 5. 轮询状态 (/task/{uuid}/info)
  console.log('步骤 [4/4]: 轮询等待计算结果（预计耗时 5~10 分钟）:');
  const pollIntervalMs = 5000;

  while (true) {
    try {
      const infoRes = await fetch(`${ODM_URL}/task/${uuid}/info`);
      if (!infoRes.ok) {
        console.error(`\n轮询请求失败: ${infoRes.status}`);
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }
      const info = await infoRes.json();
      const code = info.status?.code;
      const progress = Math.round(info.progress || 0);

      // 状态码：10=排队, 20=计算中, 30=失败, 40=成功
      process.stdout.write(`\r⌛ [状态码: ${code}] 重建进度: ${progress}% `);

      if (code === 40) {
        console.log('\n\n==============================================');
        console.log('🎉 三维重建全部完成！');
        console.log(`⏱ 总耗时: ${(info.processingTime / 1000).toFixed(1)} 秒`);
        console.log(`📁 3D Tiles 入口文件位于本地:`);
        console.log(path.join(LOCAL_DATA_DIR, uuid, '3d_tiles/model/tileset.json'));
        console.log('==============================================');
        
        // 自动将 WSL 原生 ext4 中的计算成果同步复制到本地 Windows odm_data 目录
        const wslTaskDir = `\\\\wsl$\\Ubuntu-22.04\\var\\lib\\odm_data\\${uuid}`;
        const localTaskDir = path.join(LOCAL_DATA_DIR, uuid);
        if (fs.existsSync(wslTaskDir) && !fs.existsSync(localTaskDir)) {
          try {
            console.log(`正在将三维实景成果同步到本地目录: ${localTaskDir}...`);
            fs.cpSync(wslTaskDir, localTaskDir, { recursive: true });
            console.log('✔ 本地成果同步完成！可在 VS Code 文件树中直接查看。');
          } catch (syncErr) {
            console.warn('同步本地目录警告:', syncErr.message);
          }
        }

        const taskInfo = JSON.stringify({
          uuid,
          completedAt: new Date().toISOString(),
          tilesetUrl: `http://localhost:8088/${uuid}/3d_tiles/model/tileset.json`
        }, null, 2);

        try { fs.writeFileSync(path.join(LOCAL_DATA_DIR, 'latest_task.json'), taskInfo); } catch {}
        try { fs.writeFileSync('\\\\wsl$\\Ubuntu-22.04\\var\\lib\\odm_data\\latest_task.json', taskInfo); } catch {}

        break;
      }

      if (code === 30 || code === 50) {
        console.log('\n');
        const logRes = await fetch(`${ODM_URL}/task/${uuid}/output?line=-20`);
        const logs = await logRes.json();
        throw new Error(`❌ 重建失败，最后日志:\n${Array.isArray(logs) ? logs.join('\n') : JSON.stringify(logs)}`);
      }
    } catch (err) {
      if (err.message.includes('❌ 重建失败')) throw err;
      console.error(`\n轮询出现异常: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

runMinimalReconstruction().catch(console.error);
