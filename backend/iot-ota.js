//iot-ota.js
// iot-ota.js
const fs = require('fs');
const path = require('path');

const FW_DIR = path.join(__dirname, 'firmware');

// helper genérico
function getLatestFirmwareForType(type /* 'KH' | 'LCD' | 'DOSER' */) {
  const files = fs.readdirSync(FW_DIR);
  const prefix = `RBS_${type}_`;

  const candidates = files.filter(
    (f) => f.startsWith(prefix) && f.endsWith('.bin')
  );
  if (!candidates.length) return null;

  const parseVer = (name) => {
    const base = name.replace('.bin', ''); // RBS_KH_260118
    const parts = base.split('_');        // ["RBS","KH","260118"]
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

