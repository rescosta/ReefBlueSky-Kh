// controllers/statusController.js
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

const getStatus = (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'online',
      version: '2.0-rev06',
      timestamp: new Date().toISOString(),
      mqtt: {
        enabled: false,
        connected: false,
        broker: MQTT_BROKER
      },
      uptime: process.uptime()
    }
  });
};

const getHealth = (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    success: true,
    data: {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
      },
      uptime: process.uptime() + ' segundos',
      timestamp: new Date().toISOString()
    }
  });
};

module.exports = { getStatus, getHealth };
