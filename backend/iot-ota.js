// iot-ota.js

const fs   = require('fs');
const path = require('path');

// Pasta local de firmware (já sincronizada pelo sync_firmware.sh)
const FW_DIR = path.join(__dirname, 'firmware');  // backend/firmware

function getLatestFirmwareForType(type) {  // KH, LCD, DOSER
  const files = fs.existsSync(FW_DIR) ? fs.readdirSync(FW_DIR) : [];
  const prefix = `RBS_${type.toUpperCase()}_`;
  const candidates = files.filter(f => f.startsWith(prefix) && f.endsWith('.bin'));
  if (!candidates.length) return null;

  const parseVer = (name) => {
    const base = name.replace('.bin', '');
    const parts = base.split('_');   // RBS_KH_260120 -> ["RBS","KH","260120"]
    return parts[2] || '000000';
  };

  return candidates.reduce((acc, cur) => {
    const va = parseInt(parseVer(acc), 10) || 0;
    const vb = parseInt(parseVer(cur), 10) || 0;
    return vb > va ? cur : acc;
  });
}

module.exports = {
  FW_DIR,
  getLatestFirmwareForType,
};
