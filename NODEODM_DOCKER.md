# NodeODM 三维实景建模引擎 Docker 部署与配置指南

本指南用于指导在宿主机（尤其是回家后的 **RTX 3060 台式机**）上部署和重新挂载 NodeODM 容器，并确保 **`-t`（Z-up 垂直坐标系）** 永久生效。

---

## 一、核心原理与映射关系

NestJS 已经封装好了全套三维重建流水线，只需 Docker 容器满足以下两项映射：

| 映射项 | 宿主机 (Windows) | 容器内部 (Linux) | 说明 |
| :--- | :--- | :--- | :--- |
| **网络端口** | `3050` | `3000` | NestJS `.env.development` 中配置的 `ODM_URL=http://127.0.0.1:3050` |
| **成果目录** | `<项目根目录>/uploads/odm_cache` | `/var/www/data` | 重建产出的 3D Tiles 物理存放路径，Nest 静态托管到 `/api/models/` |

> ⚠️ **为什么必须加 `-t` 参数？**  
> NodeODM 内置的切片器 `Obj2Tiles` 默认输出 Y-up 模型，在 CesiumJS 中会侧躺/倒立。  
> 注入 `-t` (`--y-up-to-z-up`) 后，顶点和包围盒原生转换为 **OGC 标准 Z-up 垂直坐标系**，前端 Cesium 零旋转零偏移，严丝合缝贴地！

---

## 二、回家 3060 台式机部署（NVIDIA GPU 模式）

### 1. 启动容器（如果已有旧容器，先清理）
在 PowerShell 中运行（**请替换为你 3060 电脑上的真实绝对路径**）：

```powershell
# 1. 如果已有旧容器先停止并删除
docker rm -f nodeodm-gpu

# 2. 启动 GPU 加速容器并挂载项目目录（带开机自启）
docker run -d --name nodeodm-gpu `
  --gpus all `
  -p 3050:3000 `
  -v D:/你的代码路径/my-nest/uploads/odm_cache:/var/www/data `
  --restart=always `
  opendronemap/nodeodm:gpu
```

### 2. 注入 `-t` 坐标轴补丁（必做）
```powershell
docker exec -i nodeodm-gpu sed -i 's/--alt {alt} /--alt {alt} -t /g' /code/opendm/ogctiles.py
```

### 3. 验证 `-t` 是否成功注入
```powershell
docker exec -i nodeodm-gpu grep "Obj2Tiles" /code/opendm/ogctiles.py
```
> **看到如下输出即代表成功**：  
> `system.run('Obj2Tiles "{input}" "{output}" --divisions {divisions} --lat {lat} --lon {lon} --alt {alt} -t '.format(**kwargs))`

### 4. （推荐）一键固化为专属镜像
为了以后容器删了也不用重新打补丁，直接提交为本地固化镜像：
```powershell
docker commit nodeodm-gpu my-nodeodm:gpu
```
*以后若需要重新启动，直接 `docker run ... my-nodeodm:gpu`，永久自带 `-t`！*

---

## 三、开发笔记本部署（CPU 极速模式，备用）

如果在公司轻薄本或无独显环境测试：

```powershell
# 1. 清理旧容器
docker rm -f nodeodm-cpu

# 2. 启动 CPU 模式容器
docker run -d --name nodeodm-cpu `
  -p 3050:3000 `
  -v D:/你的代码路径/my-nest/uploads/odm_cache:/var/www/data `
  --restart=always `
  opendronemap/nodeodm:latest --max-concurrency 4

# 3. 注入 -t 补丁
docker exec -i nodeodm-cpu sed -i 's/--alt {alt} /--alt {alt} -t /g' /code/opendm/ogctiles.py
```

---

## 四、服务健康检查

在宿主机终端执行以下命令测试服务是否正常：

```powershell
curl http://127.0.0.1:3050/info
```

返回包含 `"version":"3.6.2"` 和 `"engine":"odm"` 的 JSON 即代表引擎完全就绪，启动 NestJS 后不会再出现任何 `fetch failed` 报错！

---

## 五、常见问题与日常运维

1. **宿主机项目搬迁 / 路径变了怎么办？**  
   只需执行 `docker rm -f nodeodm-gpu`，然后修改 `-v` 后面的宿主机绝对路径重新 `docker run` 即可。
2. **每次开机需要手动敲命令启动吗？**  
   不需要！因为命令中带有 `--restart=always`，只要 Windows 启动并打开了 Docker Desktop，后台服务就会自动拉起。
