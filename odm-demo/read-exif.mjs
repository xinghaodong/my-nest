import fs from 'node:fs';
import path from 'node:path';

/**
 * 航拍无人机照片 EXIF / XMP 元数据全量解析器 (零外部依赖，纯原生 Node.js 实现)
 * 支持：DJI 大疆全系列（Phantom/Mavic/Matrice/Inspire）、道通 Autel、以及标准相机
 */

// 辅助函数：格式化数值
const formatNum = (val, digits = 6) => (typeof val === 'number' ? Number(val.toFixed(digits)) : val);

// 二进制读取辅助类 (支持大端 Big-Endian 和小端 Little-Endian)
class BufferReader {
  constructor(buffer, isLittleEndian = true) {
    this.buffer = buffer;
    this.isLittleEndian = isLittleEndian;
  }

  readUInt16(offset) {
    return this.isLittleEndian
      ? this.buffer.readUInt16LE(offset)
      : this.buffer.readUInt16BE(offset);
  }

  readUInt32(offset) {
    return this.isLittleEndian
      ? this.buffer.readUInt32LE(offset)
      : this.buffer.readUInt32BE(offset);
  }

  readRational(offset) {
    const num = this.readUInt32(offset);
    const den = this.readUInt32(offset + 4);
    return den === 0 ? 0 : num / den;
  }
}

/**
 * 1. 解析 JPEG EXIF (TIFF 格式)
 */
function parseExif(buffer) {
  const result = {
    make: null,
    model: null,
    dateTime: null,
    focalLength: null,
    exposureTime: null,
    fNumber: null,
    iso: null,
    gps: null,
  };

  // 寻找 APP1 (0xFFE1) 且标头为 "Exif\0\0"
  let tiffOffset = -1;
  for (let i = 0; i < Math.min(buffer.length - 8, 65536); i++) {
    if (
      buffer[i] === 0xff &&
      buffer[i + 1] === 0xe1 &&
      buffer.toString('ascii', i + 4, i + 8) === 'Exif' &&
      buffer[i + 8] === 0x00 &&
      buffer[i + 9] === 0x00
    ) {
      tiffOffset = i + 10;
      break;
    }
  }

  if (tiffOffset === -1) return result;

  const tiffBuf = buffer.subarray(tiffOffset);
  const endianTag = tiffBuf.toString('ascii', 0, 2);
  const isLE = endianTag === 'II'; // 'II' = Intel (Little Endian), 'MM' = Motorola (Big Endian)
  const reader = new BufferReader(tiffBuf, isLE);

  // 读取 IFD0 偏移
  const ifd0Offset = reader.readUInt32(4);
  if (ifd0Offset >= tiffBuf.length) return result;

  let gpsInfoOffset = -1;
  let exifSubIfdOffset = -1;

  // 遍历 IFD0
  const numEntries0 = reader.readUInt16(ifd0Offset);
  for (let i = 0; i < numEntries0; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > tiffBuf.length) break;

    const tag = reader.readUInt16(entryOffset);
    const count = reader.readUInt32(entryOffset + 4);
    const valOffset = reader.readUInt32(entryOffset + 8);

    if (tag === 0x010f) {
      // Make
      result.make = tiffBuf.toString('utf8', valOffset, valOffset + count).replace(/\0/g, '').trim();
    } else if (tag === 0x0110) {
      // Model
      result.model = tiffBuf.toString('utf8', valOffset, valOffset + count).replace(/\0/g, '').trim();
    } else if (tag === 0x0132) {
      // DateTime
      result.dateTime = tiffBuf.toString('utf8', valOffset, valOffset + count).replace(/\0/g, '').trim();
    } else if (tag === 0x8825) {
      // GPSInfo IFD Pointer
      gpsInfoOffset = valOffset;
    } else if (tag === 0x8769) {
      // ExifSubIFD Pointer
      exifSubIfdOffset = valOffset;
    }
  }

  // 遍历 ExifSubIFD (读取快门、焦距、ISO等)
  if (exifSubIfdOffset > 0 && exifSubIfdOffset < tiffBuf.length) {
    const numSub = reader.readUInt16(exifSubIfdOffset);
    for (let i = 0; i < numSub; i++) {
      const entryOffset = exifSubIfdOffset + 2 + i * 12;
      if (entryOffset + 12 > tiffBuf.length) break;

      const tag = reader.readUInt16(entryOffset);
      const valOffset = reader.readUInt32(entryOffset + 8);

      if (tag === 0x9003 && !result.dateTime) {
        // DateTimeOriginal
        const count = reader.readUInt32(entryOffset + 4);
        result.dateTime = tiffBuf.toString('utf8', valOffset, valOffset + count).replace(/\0/g, '').trim();
      } else if (tag === 0x920a) {
        // FocalLength
        result.focalLength = formatNum(reader.readRational(valOffset), 2);
      } else if (tag === 0x829a) {
        // ExposureTime
        const exp = reader.readRational(valOffset);
        result.exposureTime = exp < 1 ? `1/${Math.round(1 / exp)}s (${formatNum(exp, 6)}s)` : `${exp}s`;
      } else if (tag === 0x829d) {
        // FNumber (光圈)
        result.fNumber = `f/${formatNum(reader.readRational(valOffset), 1)}`;
      } else if (tag === 0x8827) {
        // ISO
        result.iso = reader.readUInt16(entryOffset + 8);
      }
    }
  }

  // 遍历 GPS IFD (读取经纬度与海拔)
  if (gpsInfoOffset > 0 && gpsInfoOffset < tiffBuf.length) {
    const numGps = reader.readUInt16(gpsInfoOffset);
    let latRef = 'N', lonRef = 'E', altRef = 0;
    let latDMS = null, lonDMS = null, altitude = null;

    for (let i = 0; i < numGps; i++) {
      const entryOffset = gpsInfoOffset + 2 + i * 12;
      if (entryOffset + 12 > tiffBuf.length) break;

      const tag = reader.readUInt16(entryOffset);
      const valOffset = reader.readUInt32(entryOffset + 8);

      if (tag === 0x0001) {
        // GPSLatitudeRef
        latRef = String.fromCharCode(tiffBuf[entryOffset + 8]);
      } else if (tag === 0x0002) {
        // GPSLatitude
        latDMS = [
          reader.readRational(valOffset),
          reader.readRational(valOffset + 8),
          reader.readRational(valOffset + 16),
        ];
      } else if (tag === 0x0003) {
        // GPSLongitudeRef
        lonRef = String.fromCharCode(tiffBuf[entryOffset + 8]);
      } else if (tag === 0x0004) {
        // GPSLongitude
        lonDMS = [
          reader.readRational(valOffset),
          reader.readRational(valOffset + 8),
          reader.readRational(valOffset + 16),
        ];
      } else if (tag === 0x0005) {
        // GPSAltitudeRef (0 = 海平面以上, 1 = 海平面以下)
        altRef = tiffBuf[entryOffset + 8];
      } else if (tag === 0x0006) {
        // GPSAltitude
        altitude = reader.readRational(valOffset);
        if (altRef === 1) altitude = -altitude;
      }
    }

    if (latDMS && lonDMS) {
      // 转换为十进制经纬度 (DD)
      const latDD = (latDMS[0] + latDMS[1] / 60 + latDMS[2] / 3600) * (latRef === 'S' ? -1 : 1);
      const lonDD = (lonDMS[0] + lonDMS[1] / 60 + lonDMS[2] / 3600) * (lonRef === 'W' ? -1 : 1);

      result.gps = {
        latitude: formatNum(latDD, 7),
        longitude: formatNum(lonDD, 7),
        latitudeDMS: `${Math.floor(latDMS[0])}°${Math.floor(latDMS[1])}'${formatNum(latDMS[2], 2)}"${latRef}`,
        longitudeDMS: `${Math.floor(lonDMS[0])}°${Math.floor(lonDMS[1])}'${formatNum(lonDMS[2], 2)}"${lonRef}`,
        altitude: altitude !== null ? formatNum(altitude, 3) : null,
      };
    }
  }

  return result;
}

/**
 * 2. 解析大疆专有 XMP 元数据 (包含云台角度、相对高程、航向角、RTK状态等)
 */
function parseDjiXmp(buffer) {
  const result = {
    absoluteAltitude: null,
    relativeAltitude: null,
    gimbalRoll: null,
    gimbalPitch: null,
    gimbalYaw: null,
    flightRoll: null,
    flightPitch: null,
    flightYaw: null,
    rtkFlag: null,
    rtkStdLon: null,
    rtkStdLat: null,
    rtkStdHgt: null,
    rawTags: {},
  };

  // 搜索 XMP XML 数据块 (通常在前 128KB 内)
  const maxSearchLen = Math.min(buffer.length, 262144);
  const text = buffer.toString('latin1', 0, maxSearchLen);

  const xmpStart = text.indexOf('<x:xmpmeta');
  const xmpEnd = text.indexOf('</x:xmpmeta>');

  if (xmpStart === -1 || xmpEnd === -1) return result;

  const xmpXml = text.substring(xmpStart, xmpEnd + 12);

  // 正则提取所有 drone-dji:xxx 属性
  const regex = /drone-dji:([a-zA-Z0-9_-]+)=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(xmpXml)) !== null) {
    const key = match[1];
    const val = match[2];
    result.rawTags[key] = val;

    const numVal = parseFloat(val);
    switch (key) {
      case 'AbsoluteAltitude':
        result.absoluteAltitude = numVal;
        break;
      case 'RelativeAltitude':
        result.relativeAltitude = numVal;
        break;
      case 'GimbalRollDegree':
        result.gimbalRoll = numVal;
        break;
      case 'GimbalPitchDegree':
        result.gimbalPitch = numVal;
        break;
      case 'GimbalYawDegree':
        result.gimbalYaw = numVal;
        break;
      case 'FlightRollDegree':
        result.flightRoll = numVal;
        break;
      case 'FlightPitchDegree':
        result.flightPitch = numVal;
        break;
      case 'FlightYawDegree':
        result.flightYaw = numVal;
        break;
      case 'RtkFlag':
        result.rtkFlag = parseInt(val, 10);
        break;
      case 'RtkStdLon':
        result.rtkStdLon = numVal;
        break;
      case 'RtkStdLat':
        result.rtkStdLat = numVal;
        break;
      case 'RtkStdHgt':
        result.rtkStdHgt = numVal;
        break;
    }
  }

  return result;
}

/**
 * 主执行函数
 */
export function extractDroneMetadata(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const fileStats = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);

  const exif = parseExif(buffer);
  const dji = parseDjiXmp(buffer);

  return {
    filePath: path.resolve(filePath),
    fileName: path.basename(filePath),
    fileSizeMb: formatNum(fileStats.size / (1024 * 1024), 2),
    camera: {
      make: exif.make,
      model: exif.model,
      dateTime: exif.dateTime,
      focalLengthMm: exif.focalLength,
      aperture: exif.fNumber,
      shutter: exif.exposureTime,
      iso: exif.iso,
    },
    gps: exif.gps,
    djiFlightData: {
      absoluteAltitudeM: dji.absoluteAltitude ?? exif.gps?.altitude,
      relativeAltitudeM: dji.relativeAltitude,
      gimbal: {
        pitch: dji.gimbalPitch,
        yaw: dji.gimbalYaw,
        roll: dji.gimbalRoll,
      },
      aircraft: {
        pitch: dji.flightPitch,
        yaw: dji.flightYaw,
        roll: dji.flightRoll,
      },
      rtk: {
        status:
          dji.rtkFlag === 1
            ? 'RTK 固定解 (厘米级高精)'
            : dji.rtkFlag === 2
            ? 'RTK 浮动解'
            : dji.rtkFlag === 0
            ? '单点 GPS (常规精度)'
            : '未知 / 无 RTK 标签',
        stdLonM: dji.rtkStdLon,
        stdLatM: dji.rtkStdLat,
        stdHgtM: dji.rtkStdHgt,
      },
    },
    mapLinks: exif.gps
      ? {
          googleMaps: `https://www.google.com/maps?q=${exif.gps.latitude},${exif.gps.longitude}`,
          openStreetMap: `https://www.openstreetmap.org/?mlat=${exif.gps.latitude}&mlon=${exif.gps.longitude}#map=18/${exif.gps.latitude}/${exif.gps.longitude}`,
        }
      : null,
  };
}

// CLI 命令行直接执行逻辑
const targetFile = process.argv[2] || path.resolve('./images/DJI_0018.JPG');

console.log('===============================================================');
console.log(`🔍 正在解析航拍原图元数据: ${targetFile}`);
console.log('===============================================================\n');

try {
  const meta = extractDroneMetadata(targetFile);

  console.log('📷 【相机与曝光参数】');
  console.log(`   - 设备品牌: ${meta.camera.make || '未知'}`);
  console.log(`   - 相机型号: ${meta.camera.model || '未知'}`);
  console.log(`   - 拍摄时间: ${meta.camera.dateTime || '未知'}`);
  console.log(`   - 等效焦距: ${meta.camera.focalLengthMm ? meta.camera.focalLengthMm + ' mm' : '未知'}`);
  console.log(`   - 光圈快门: ${meta.camera.aperture || '未知'} | ${meta.camera.shutter || '未知'}`);
  console.log(`   - ISO 感光: ${meta.camera.iso || '未知'}\n`);

  console.log('🌐 【WGS-84 地理坐标 (EXIF)】');
  if (meta.gps) {
    console.log(`   - 纬度 (Lat): ${meta.gps.latitude}° (${meta.gps.latitudeDMS})`);
    console.log(`   - 经度 (Lon): ${meta.gps.longitude}° (${meta.gps.longitudeDMS})`);
    console.log(`   - 椭球高 (Alt): ${meta.gps.altitude} 米`);
    console.log(`   - 谷歌地图: ${meta.mapLinks.googleMaps}`);
  } else {
    console.log('   ⚠️ 未检测到标准 GPS 经纬度信息');
  }
  console.log('');

  console.log('🛸 【大疆专有航测与位姿数据 (XMP)】');
  const dji = meta.djiFlightData;
  console.log(`   - 绝对海拔高程: ${dji.absoluteAltitudeM !== null ? dji.absoluteAltitudeM + ' 米' : '无'}`);
  console.log(`   - 相对起飞高度: ${dji.relativeAltitudeM !== null ? dji.relativeAltitudeM + ' 米' : '无'}`);
  console.log(
    `   - 云台姿态 (Gimbal): 俯仰=${dji.gimbal.pitch ?? '无'}°, 航向=${dji.gimbal.yaw ?? '无'}°, 横滚=${dji.gimbal.roll ?? '无'}°`
  );
  console.log(
    `   - 飞行器姿态 (Aircraft): 俯仰=${dji.aircraft.pitch ?? '无'}°, 航向=${dji.aircraft.yaw ?? '无'}°, 横滚=${dji.aircraft.roll ?? '无'}°`
  );
  console.log(`   - RTK 定位状态: ${dji.rtk.status}`);
  if (dji.rtk.stdLonM) {
    console.log(`   - 精度标准差: 经度±${dji.rtk.stdLonM}m, 纬度±${dji.rtk.stdLatM}m, 高度±${dji.rtk.stdHgtM}m`);
  }
  console.log('\n===============================================================');
  console.log('✅ 解析完成！此数据结构可直接供 Nest.js 服务或 Cesium 航线飞控使用。');
  console.log('===============================================================');
} catch (err) {
  console.error('❌ 解析失败:', err.message);
}
