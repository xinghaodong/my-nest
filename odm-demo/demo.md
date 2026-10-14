# OpenDroneMap (NodeODM) 航测实景三维全流程与 3D Tiles 坐标轴 Bug 深度排查指南

---

## 目录
1. [项目背景与目标](#一项目背景与目标)
2. [环境准备与系统架构](#二环境准备与系统架构)
3. [三维重建调用与极速模式配置](#三三维重建调用与极速模式配置)
4. [核心疑难：3D Tiles 倒立与偏移 Bug 根因剖析](#四核心疑难3d-tiles-倒立与偏移-bug-根因剖析)
5. [两套解决方案技术对比与评估](#五两套解决方案技术对比与评估)
6. [生产环境部署与永久固化方案](#六生产环境部署与永久固化方案)
7. [前端 Cesium 规范化接入指南](#七前端-cesium-规范化接入指南)

---

## 一、项目背景与目标

- **业务需求**：在智慧城市、园区巡检或数字孪生大屏中，接入无人机航测实景三维倾斜摄影模型。
- **自主可控限制**：因商业授权限制、离线私有化部署要求或高额 API 成本，**无法使用大疆官方商业软件（如大疆智图 DJI Terra / DJI Cloud API）**。
- **技术路线**：选用国际主流开源航测实景三维工具链 **OpenDroneMap (ODM) / NodeODM**，从航拍照片（JPG+EXIF/POS）全自动解算生成标准 **OGC 3D Tiles (b3dm + glTF)**，并在前端 **CesiumJS (Vue3)** 中无缝加载展示。
- **计算设备规划**：
  - **本地开发验证**：Intel Ultra 5（集显无独显，Docker CPU 模式）。
  - **生产部署环境**：NVIDIA GeForce RTX 5090（CUDA GPU 加速集群）。

---

## 二、环境准备与系统架构

### 1. 技术栈构成
```
[无人机照片 (JPG + EXIF GPS)]
            ↓
┌──────────────────────────────────────────────┐
│  NodeODM 容器服务 (端口: 3050)                │
│  - RESTful API 调度器 (/task/new/...)        │
│  - OpenSfM (稀疏点云重建 + 相机位姿解算)     │
│  - OpenMVS (稠密点云 + 泊松网格重建 + 纹理映射) │
│  - Obj2Tiles (3D Tiles 瓦片空间树切片器)      │
└──────────────────────────────────────────────┘
            ↓
[生成的 3D Tiles: tileset.json + *.b3dm]
            ↓
┌──────────────────────────────────────────────┐
│  前端 CesiumJS (Vue3 / Vite, 端口: 9001)     │
│  - 原生 Cesium3DTileset.fromUrl()            │
│  - 卫星遥感底图贴合，全量空间分析            │
└──────────────────────────────────────────────┘
```

### 2. 启动本地 NodeODM CPU 容器
```bash
# 挂载宿主机数据目录，映射 3050 端口
docker run -d --name nodeodm-cpu \
  -p 3050:3000 \
  -v d:/xuexi/nodes/nest/odm-demo/odm_data:/var/www/data \
  opendronemap/nodeodm:latest
```

### 3. 启动本地瓦片静态文件服务器
```bash
npx -y http-server "d:/xuexi/nodes/nest/odm-demo/odm_data" -p 8088 --cors
```

---

## 三、三维重建调用与极速模式配置

在本地无独显（CPU 环境）测试时，若使用默认参数耗时可能长达数小时，因此需配置**极速验证参数**：

| 参数名 | 极速推荐值 | 默认值 | 作用与原理 |
| :--- | :--- | :--- | :--- |
| `3d-tiles` | `true` | `false` | **必须指定**，强制启动 3D Tiles 切片管道 |
| `use-exif` | `true` | `true` | 从照片读取 GPS 与云台姿态信息进行地理参考 |
| `feature-quality` | `'low'` | `'high'` | 降低特征点提取密度，大幅减少 CPU 特征匹配耗时 |
| `pc-quality` | `'lowest'` | `'medium'` | 减少稠密点云密度，降低内存占用，杜绝 OOM 崩溃 |
| `mesh-octree-depth` | `8` | `11` | 网格八叉树深度，8 级细分快速成网（18张图只需约 2 分钟） |
| `skip-orthophoto` | `true` | `false` | 跳过二维正射影像（GeoTIFF）拼接，只出三维模型 |

### Node.js 任务调度脚本 (`build-3dtiles.mjs`) 核心调用流
1. **任务初始化**：`POST /task/new/init`，提交上述 options，获取任务 `uuid`。
2. **多图流式上传**：`POST /task/new/upload/{uuid}`，将 images 文件夹下的航拍原图上传。
3. **启动计算**：`POST /task/new/commit/{uuid}`。
4. **轮询状态**：`GET /task/{uuid}/info`，直到 `status.code === 40` (成功)。

---

## 四、核心疑难：3D Tiles 倒立与偏移 Bug 根因剖析

### 1. 现象描述
使用 OpenDroneMap 导出的 3D Tiles 放入 CesiumJS 默认场景时：
- **模型倒栽葱立起/翻转**（垂直面被当成了水平面，或模型倒扣）。
- **水平坐标严重偏离**（本该在岸边的建筑，横向位移了 160 多米插入水底）。
- **前端调参陷入死循环**：在前端用 `HeadingPitchRoll` 矩阵旋转 180° 后，发现还必须加上 `East -125m, North 35m` 的偏移行距去硬凑，代码极其繁重冗余。

### 2. 官方 GitHub Issue 关联
- **`OpenDroneMap/ODM#2073`**：*[ODM 3D Tiles Incorrect Rotation and Geographic Alignment in CesiumJS](https://github.com/OpenDroneMap/ODM/issues)*
- **`OpenDroneMap/Obj2Tiles`**：官方用于将 `.obj` 转为 `3D Tiles` 的专门工具。

### 3. 底层真实根因（坐标轴标准冲突）

很多初学者误以为是航拍 GPS 不准或 OpenSfM 算法有问题，**实测证明空间地理定位零误差**：
- 根节点 `transform` 矩阵反算的经纬高：`46.84265124°N, -91.99400951°W, 0.00m`，与航拍日志完全吻合。
- **真正的病因在于：glTF 的 Up 轴约定与 OBJ 的顶点轴向不匹配**。

```
[OpenMVS 密集模型: odm_textured_model_geo.obj]
    → 坐标系是 UTM + 绝对海拔：
      X: 东西偏移 [-63.1m, 72.2m]
      Y: 南北偏移 [-64.4m, 51.4m]
      Z: 绝对海拔高程 [152.1m, 174.3m]  <-- 明确是 Z 轴朝上 (Z-up)！

          ↓ (漏洞环节)

[ODM Python 执行脚本: /code/opendm/ogctiles.py 第 67 行]
    → 源码调用: Obj2Tiles "input.obj" "output" --divisions 1 --lat ... --lon ...
    → 漏洞：未传入 -t 参数！
    → Obj2Tiles 默认设定：y-up-to-z-up = false。它假定输入的 OBJ 是标准的 Y-up（Y 轴朝上），
      因此将 OBJ 的顶点 (X, Y, Z) 原样不转动地封入了 glTF 的 (X, Y, Z)。

          ↓ (Cesium 渲染碰撞)

[Cesium 渲染规范]
    → glTF 2.0 规范：模型局部空间默认是 Y-up（+Y 朝上，+Z 朝前）。
    → Cesium 加载 b3dm 时，按规范强行施加了一次 +90° 旋转将 glTF 的 Y 轴转为地球 ENU 的 Z 轴。
    → 灾难发生：原本放在 Z 轴上的 160 米海拔高度，被 Cesium 转到了水平方向上！
      垂直的山体和建筑直接横向“卧倒”插进了湖泊，整体倾覆并产生约 160 米的水平位移！
```

---

## 五、两套解决方案技术对比与评估

针对此问题，业界有两种不同层面的解决思路：

### 方案 A：下游打补丁（修改 `tileset.json` 元数据）
- **做法**：
  1. 在 `tileset.json` 的 `asset` 节点增加 Cesium 早期私有属性：`"gltfUpAxis": "Z"`。
  2. 手动用脚本将 `boundingVolume.box` 的局部 Y/Z 坐标值交换覆盖。
- **优缺点评价**：
  - **优点**：不需要改动 Docker 镜像内部，适合只在 CesiumJS 单一平台且模型只有 1 层切片时临时修补。
  - **缺点**：`gltfUpAxis` 非 OGC 3D Tiles 官方标准字段，跨平台（如 Unreal、Unity、QGIS 3D、SuperMap）时会被忽略导致倒立；且当切片规模大存在多级 LOD 时，手动递归修改各层级包围盒极易出错导致视锥剔除（Culling）模型闪烁。

### 方案 B：源头治本（给 `Obj2Tiles` 传递 `-t` 参数）——【推荐最佳实践】
- **做法**：
  `Obj2Tiles` 工具作者专门设计了 `-t` 参数：
  ```text
  -t, --y-up-to-z-up (Default: false)
  Convert the upward Y-axis to the upward Z-axis...
  ```
  只需在 `/code/opendm/ogctiles.py` 调用中加上 `-t`。
- **优缺点评价**：
  - **优点**：切片器内部自动处理顶点重排、法线计算、多级 LOD 包围盒（Bounding Box），产物 **100% 严格符合 OGC 3D Tiles 行业标准**。前端和后端完全无需编写任何坐标修正代码，直接原生加载即可严丝合缝贴地！
  - **实测验证**：加了 `-t` 重新切片后，在 Cesium 中 `modelMatrix = IDENTITY`，滑块全归零，模型完美立于地表，车辆、道路与卫星地图完全重叠。

---

## 六、生产环境部署与永久固化方案

为了在后续长期开发以及未来的 **RTX 5090 生产服务器** 上永久避免该问题，推荐以下任意一种固化手段：

### 推荐方案 1：定制 2 行代码专属镜像（工业级标准）
在生产机部署时，编写一个简单的 `Dockerfile`：
```dockerfile
# 生产环境使用 GPU 基础镜像
FROM opendronemap/nodeodm:gpu

# 永久为 3D Tiles 切片脚本注入 -t 参数
RUN sed -i 's/--alt {alt} /--alt {alt} -t /g' /code/opendm/ogctiles.py
```
构建后运行自定义镜像，后续所有航测任务天生具备原生 Z-up 能力。

### 推荐方案 2：容器单文件挂载
将修改好的 `ogctiles.py` 放在宿主机，启动容器时挂载覆盖：
```bash
docker run -d \
  -p 3000:3000 \
  -v /opt/nodeodm/ogctiles.py:/code/opendm/ogctiles.py \
  opendronemap/nodeodm:gpu
```

### 推荐方案 3：容器启动后自动热修
若使用官方镜像运行，启动后执行一句热修复命令：
```bash
docker exec -i nodeodm-cpu sed -i 's/--alt {alt} /--alt {alt} -t /g' /code/opendm/ogctiles.py
```

---

## 七、前端 Cesium 规范化接入指南

完成源头 `-t` 修复后，前端代码回归最优雅的标准姿态，**严禁使用任何 `heading/pitch/roll` 欧拉角逆矩阵或 ENU 平移硬凑**。

### 标准加载代码示例（Vue3 / 组件通用）
```javascript
// 在组件中直接原生引入，零额外运算
const tileset = await Cesium.Cesium3DTileset.fromUrl('http://localhost:8088/{uuid}/3d_tiles/model/tileset.json', {
    maximumScreenSpaceError: 16, // 控制几何误差层级，默认16平衡清晰度与显存
    skipLevelOfDetail: true,     // 开启 LOD 跳跃加载，大幅降低网速慢时的加载白屏
    dynamicScreenSpaceError: true,
    cullWithChildrenBounds: true,
});

viewer.scene.primitives.add(tileset);

// 相机平滑飞往模型视角
await viewer.flyTo(tileset, {
    duration: 1.5,
    offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(15),
        Cesium.Math.toRadians(-40),
        tileset.boundingSphere.radius * 2.2
    ),
});
```

### 关于模型“飘在空中”与真实地形对齐的工程原理

在航测三维渲染中，常常会发现**模型悬空飘在地球表面上方**，其根本原因如下：
1. **真实 GPS 绝对海拔 vs 椭球面**：
   - 无人机航拍 EXIF 记录的是真实地理空间中的 **WGS84 椭球高（或海拔高程）**。例如本次测试的明尼苏达州布莱顿海滩，湖岸地表真实的绝对高程约为 **163.2 米**。
   - Cesium 默认不开启地形时，地球是一个光滑的几何椭球体（标高为 0 米）。因此真实的实景模型必然会“悬空”在 0 米平面的上方 163.2 米处。
2. **两类工程解决方案**：
   - **方案一：开启真实全球三维地形（最佳视觉效果）**
     开启 Cesium World Terrain 后，地表真实隆起抬升至 163.2 米，实景模型严丝合缝嵌在地表丘陵上：
     ```javascript
     viewer.terrainProvider = await Cesium.createWorldTerrainAsync({
         requestWaterMask: true,
         requestVertexNormals: true,
     });
     ```
   - **方案二：无地形（平坦地球）环境下的贴地下沉补偿**
     如果业务系统不需要加载 DEM 地形，可以仅沿地心垂直法线方向向下平移模型（消除 163.2m 高度），贴平椭球基准面：
     ```javascript
     const center = tileset.boundingSphere.center;
     const cartographic = Cesium.Cartographic.fromCartesian(center);
     const surface = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0.0);
     const offset = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, -163.2);
     const translation = Cesium.Cartesian3.subtract(offset, surface, new Cesium.Cartesian3());
     tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
     ```

---

## 八、总结
通过打通 `NodeODM 调度 → OpenMVS 重建 → Obj2Tiles -t 切片 → CesiumJS 原生呈现` 的完整链路，成功证明了**纯开源自主可控的无人机实景三维方案不仅完全可行，且精度和效率均能达到生产级水准**。彻底解决了 3D Tiles 坐标系倾覆的历史遗留隐患，为后续大规模无人机数据处理打下了坚实的技术底座。




┌─────────────────────────────────────────────────────────────────┐
│ 1. 你的宿主机 (Windows 10 / 11)                                  │
│    - 运行 Nest.js 后端服务                                        │
│    - 运行 build-3dtiles.mjs (仅负责通过 HTTP 发送指令和传照片)    │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTP API 请求 (端口 3050)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Docker 容器内部 (镜像: opendronemap/nodeodm:latest)           │
│    环境：Linux Ubuntu 系统                                       │
│                                                                 │
│    NodeODM 调度后台接收到任务后，在容器内部依次运行算法模块：        │
│      ① 稀疏重建: OpenSfM                                        │
│      ② 网格纹理化: OpenMVS (texrecon)                            │
│      ③ 瓦片切片: 👉 执行容器内部的 /code/opendm/ogctiles.py       │
│           │                                                     │
│           ▼ (这个 Python 脚本在容器内部调用二进制切片工具)        │
│         /code/SuperBuild/install/bin/Obj2Tiles ... -t           │
└─────────────────────────────────────────────────────────────────┘
