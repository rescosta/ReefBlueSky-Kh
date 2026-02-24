const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Rotas para Relatórios de Dosagem e Monitoramento de Corrente
 *
 * Estas rotas fazem proxy para o ESP32 e também podem armazenar
 * dados históricos no MySQL para análises de longo prazo
 */

// =============================================================================
// RELATÓRIOS DE DOSAGEM
// =============================================================================

/**
 * GET /api/dosing-reports/status
 * Retorna status atual de todas as bombas
 */
router.get('/status', async (req, res) => {
    try {
        const deviceId = req.query.device_id;

        if (!deviceId) {
            return res.status(400).json({ error: 'device_id é obrigatório' });
        }

        // Buscar IP do dispositivo no banco
        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        // Buscar dados do ESP32
        try {
            const response = await axios.get(`http://${deviceIP}/api/dosing/status`, {
                timeout: 5000
            });

            res.json(response.data);
        } catch (err) {
            console.error('[Reports] Erro ao buscar do ESP32:', err.message);
            res.status(503).json({
                error: 'Dispositivo offline ou não respondeu',
                details: err.message
            });
        }

    } catch (err) {
        console.error('[Reports] Erro em /status:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dosing-reports/daily
 * Retorna relatório diário de dosagens
 */
router.get('/daily', async (req, res) => {
    try {
        const deviceId = req.query.device_id;
        const daysAgo = parseInt(req.query.days_ago) || 0;

        if (!deviceId) {
            return res.status(400).json({ error: 'device_id é obrigatório' });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            const response = await axios.get(
                `http://${deviceIP}/api/dosing/report/daily?days_ago=${daysAgo}`,
                { timeout: 5000 }
            );

            res.json(response.data);
        } catch (err) {
            console.error('[Reports] Erro ao buscar relatório diário:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em /daily:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dosing-reports/monthly
 * Retorna relatório mensal de dosagens
 */
router.get('/monthly', async (req, res) => {
    try {
        const deviceId = req.query.device_id;

        if (!deviceId) {
            return res.status(400).json({ error: 'device_id é obrigatório' });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            const response = await axios.get(
                `http://${deviceIP}/api/dosing/report/monthly`,
                { timeout: 5000 }
            );

            res.json(response.data);
        } catch (err) {
            console.error('[Reports] Erro ao buscar relatório mensal:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em /monthly:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dosing-reports/history.csv
 * Retorna histórico em formato CSV
 */
router.get('/history.csv', async (req, res) => {
    try {
        const deviceId = req.query.device_id;
        const days = parseInt(req.query.days) || 30;

        if (!deviceId) {
            return res.status(400).json({ error: 'device_id é obrigatório' });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            const response = await axios.get(
                `http://${deviceIP}/api/dosing/history.csv?days=${days}`,
                { timeout: 10000 }
            );

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=dosing_history_${deviceId}_${days}days.csv`);
            res.send(response.data);
        } catch (err) {
            console.error('[Reports] Erro ao buscar CSV:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em /history.csv:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/dosing-reports/container/refill
 * Atualizar volume restante após reabastecer recipiente
 */
router.post('/container/refill', async (req, res) => {
    try {
        const { device_id, pump, liters } = req.body;

        if (!device_id || pump === undefined || !liters) {
            return res.status(400).json({
                error: 'device_id, pump e liters são obrigatórios'
            });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [device_id]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            // Enviar comando para ESP32
            const response = await axios.post(
                `http://${deviceIP}/api/dosing/container/refill`,
                { pump, liters },
                { timeout: 5000 }
            );

            // Registrar no MySQL para histórico
            await req.db.query(
                `INSERT INTO dosing_container_refills
                (device_id, pump_index, liters_added, refilled_at)
                VALUES (?, ?, ?, NOW())`,
                [device_id, pump, liters]
            );

            console.log(`[Reports] Recipiente reabastecido - Device: ${device_id}, Bomba: ${pump}, Volume: ${liters}L`);

            res.json({
                success: true,
                message: 'Recipiente reabastecido com sucesso'
            });
        } catch (err) {
            console.error('[Reports] Erro ao enviar comando de refill:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em /container/refill:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/dosing-reports/config
 * Atualizar configurações (custo, capacidade) de uma bomba
 */
router.post('/config', async (req, res) => {
    try {
        const { device_id, pump, cost_per_liter, capacity } = req.body;

        if (!device_id || pump === undefined) {
            return res.status(400).json({
                error: 'device_id e pump são obrigatórios'
            });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [device_id]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            // Enviar comando para ESP32
            const response = await axios.post(
                `http://${deviceIP}/api/dosing/config`,
                { pump, cost_per_liter, capacity },
                { timeout: 5000 }
            );

            console.log(`[Reports] Configuração atualizada - Device: ${device_id}, Bomba: ${pump}`);

            res.json({
                success: true,
                message: 'Configuração atualizada com sucesso'
            });
        } catch (err) {
            console.error('[Reports] Erro ao enviar configuração:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em /config:', err);
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// MONITORAMENTO DE CORRENTE
// =============================================================================

/**
 * GET /api/dosing-reports/current/status
 * Retorna status atual do monitoramento de corrente
 */
router.get('/current/status', async (req, res) => {
    try {
        const deviceId = req.query.device_id;

        if (!deviceId) {
            return res.status(400).json({ error: 'device_id é obrigatório' });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            const response = await axios.get(
                `http://${deviceIP}/api/current/status`,
                { timeout: 5000 }
            );

            res.json(response.data);
        } catch (err) {
            console.error('[Reports] Erro ao buscar status de corrente:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em /current/status:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/dosing-reports/current/anomalies
 * Retorna anomalias detectadas pelo sensor de corrente
 */
router.get('/current/anomalies', async (req, res) => {
    try {
        const deviceId = req.query.device_id;

        if (!deviceId) {
            return res.status(400).json({ error: 'device_id é obrigatório' });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            const response = await axios.get(
                `http://${deviceIP}/api/current/anomalies`,
                { timeout: 5000 }
            );

            // Salvar anomalias críticas no MySQL para histórico
            if (response.data && Array.isArray(response.data)) {
                for (const anomaly of response.data) {
                    if (anomaly.state === 'short' || anomaly.state === 'high') {
                        // Verificar se já foi salva
                        const [existing] = await req.db.query(
                            `SELECT id FROM dosing_current_anomalies
                            WHERE device_id = ? AND timestamp = ? AND pump_index = ?`,
                            [deviceId, anomaly.timestamp, anomaly.pump]
                        );

                        if (!existing || existing.length === 0) {
                            await req.db.query(
                                `INSERT INTO dosing_current_anomalies
                                (device_id, pump_index, state, current_ma, description, detected_at)
                                VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
                                [
                                    deviceId,
                                    anomaly.pump,
                                    anomaly.state,
                                    anomaly.current,
                                    anomaly.description,
                                    anomaly.timestamp
                                ]
                            );
                        }
                    }
                }
            }

            res.json(response.data);
        } catch (err) {
            console.error('[Reports] Erro ao buscar anomalias:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em /current/anomalies:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/dosing-reports/current/anomalies
 * Limpar histórico de anomalias
 */
router.delete('/current/anomalies', async (req, res) => {
    try {
        const deviceId = req.query.device_id;

        if (!deviceId) {
            return res.status(400).json({ error: 'device_id é obrigatório' });
        }

        const [devices] = await req.db.query(
            'SELECT ip_address FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (!devices || devices.length === 0) {
            return res.status(404).json({ error: 'Dispositivo não encontrado' });
        }

        const deviceIP = devices[0].ip_address;

        try {
            // Limpar no ESP32
            await axios.delete(
                `http://${deviceIP}/api/current/anomalies`,
                { timeout: 5000 }
            );

            console.log(`[Reports] Anomalias limpas - Device: ${deviceId}`);

            res.json({
                success: true,
                message: 'Anomalias limpas com sucesso'
            });
        } catch (err) {
            console.error('[Reports] Erro ao limpar anomalias:', err.message);
            res.status(503).json({ error: 'Dispositivo offline ou não respondeu' });
        }

    } catch (err) {
        console.error('[Reports] Erro em DELETE /current/anomalies:', err);
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// TABELAS DO BANCO DE DADOS (SQL para criar as tabelas necessárias)
// =============================================================================

/*
-- Tabela para rastrear reabastecimentos de recipientes
CREATE TABLE IF NOT EXISTS dosing_container_refills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    pump_index INT NOT NULL,
    liters_added FLOAT NOT NULL,
    refilled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_pump (device_id, pump_index),
    INDEX idx_date (refilled_at)
);

-- Tabela para armazenar anomalias críticas de corrente
CREATE TABLE IF NOT EXISTS dosing_current_anomalies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    pump_index INT NOT NULL,
    state VARCHAR(20) NOT NULL,  -- 'low', 'high', 'short'
    current_ma FLOAT NOT NULL,
    description TEXT,
    detected_at TIMESTAMP NOT NULL,
    timestamp BIGINT NOT NULL,   -- Timestamp Unix do ESP32
    INDEX idx_device_pump (device_id, pump_index),
    INDEX idx_date (detected_at),
    INDEX idx_timestamp (device_id, timestamp)
);
*/

module.exports = router;
