//iot-ota.js

const fs   = require('fs');
const path = require('path');

// Se ainda quiser suportar firmware local opcionalmente
const FW_DIR = path.join(__dirname, 'firmware');

// Base dos bins no GitHub (commit fixo ou branch/tag)
const GITHUB_FW_BASE =
  'https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/' +
  '9c2fdb253076b4848f2dbfa7a99a39133c6142df/backend/firmware/';

// helper genérico (continua igual, ainda usando FW_DIR local)
function getLatestFirmwareForType(type /* 'KH' | 'LCD' | 'DOSER' */) {
  const files = fs.existsSync(FW_DIR) ? fs.readdirSync(FW_DIR) : [];
  const prefix = `RBS_${type}_`;

  const candidates = files.filter(
    (f) => f.startsWith(prefix) && f.endsWith('.bin')
  );
  if (!candidates.length) return null;

  const parseVer = (name) => {
    const base  = name.replace('.bin', ''); // RBS_KH_260118
    const parts = base.split('_');          // ["RBS","KH","260118"]
    return parts[2] || '000000';
  };

  return candidates.reduce((acc, cur) => {
    const va = parseInt(parseVer(acc), 10) || 0;
    const vb = parseInt(parseVer(cur), 10) || 0;
    return vb > va ? cur : acc;
  });
}

// monta a URL do .bin no GitHub a partir do nome
function buildGithubFirmwareUrl(filename) {
  return GITHUB_FW_BASE + filename;
}

module.exports = {
  FW_DIR,
  getLatestFirmwareForType,
  buildGithubFirmwareUrl,
};

