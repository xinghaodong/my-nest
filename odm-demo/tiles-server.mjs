import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// 托管 3D Tiles 根目录，优先读取同目录下的 odm_data，或环境变量 TILES_ROOT
const TILES_ROOT = process.env.TILES_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'odm_data');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8088;

const MIME_TYPES = {
  '.json': 'application/json',
  '.b3dm': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.terrain': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  // 必须开启 CORS，允许 CesiumJS 跨域请求切片
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const cleanUrl = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(TILES_ROOT, cleanUrl);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end(`404 Not Found: ${cleanUrl}\nRoot: ${TILES_ROOT}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log(`📡 3D Tiles 静态服务已启动`);
  console.log(`🔗 访问地址: http://localhost:${PORT}`);
  console.log(`📁 托管目录: ${TILES_ROOT}`);
  console.log('==============================================');
});
