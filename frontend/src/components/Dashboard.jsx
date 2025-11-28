/**
 * ReefBlueSky KH Monitor - Dashboard
 */

import React, { useState, useEffect } from 'react';
import { AuthService } from '../auth';
import './Dashboard.css';

export function Dashboard({ user, onLogout }) {
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    currentKH: 0,
    avgKH: 0,
    minKH: 0,
    maxKH: 0,
    lastUpdate: null,
  });

  useEffect(() => {
    loadMeasurements();
    
    // [DASHBOARD] Atualizar a cada 30 segundos
    const interval = setInterval(loadMeasurements, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadMeasurements = async () => {
    try {
      const response = await AuthService.fetch('/measurements?limit=100');
      
      if (!response.ok) {
        throw new Error('Falha ao carregar medições');
      }

      const data = await response.json();
      setMeasurements(data.measurements || []);
      
      // [DASHBOARD] Calcular estatísticas
      if (data.measurements && data.measurements.length > 0) {
        const khValues = data.measurements.map(m => m.kh);
        setStats({
          currentKH: khValues[0],
          avgKH: (khValues.reduce((a, b) => a + b, 0) / khValues.length).toFixed(2),
          minKH: Math.min(...khValues).toFixed(2),
          maxKH: Math.max(...khValues).toFixed(2),
          lastUpdate: new Date(data.measurements[0].timestamp).toLocaleString('pt-BR'),
        });
      }

      setError(null);
    } catch (err) {
      console.error('[DASHBOARD] Erro ao carregar medições:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    loadMeasurements();
  };

  if (loading && measurements.length === 0) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>🌊 ReefBlueSky Dashboard</h1>
          <div className="header-actions">
            <span className="user-info">👤 {user?.email}</span>
            <button className="logout-button" onClick={onLogout}>
              🚪 Sair
            </button>
          </div>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <p>Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* [HEADER] */}
      <div className="dashboard-header">
        <h1>🌊 ReefBlueSky Dashboard</h1>
        <div className="header-actions">
          <span className="user-info">👤 {user?.email}</span>
          <button 
            className="refresh-button" 
            onClick={handleRefresh}
            disabled={loading}
          >
            🔄 Atualizar
          </button>
          <button className="logout-button" onClick={onLogout}>
            🚪 Sair
          </button>
        </div>
      </div>

      {/* [ERRO] */}
      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* [ESTATÍSTICAS] */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">KH Atual</div>
          <div className="stat-value">{stats.currentKH.toFixed(2)}</div>
          <div className="stat-unit">dKH</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Média</div>
          <div className="stat-value">{stats.avgKH}</div>
          <div className="stat-unit">dKH</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Mínimo</div>
          <div className="stat-value">{stats.minKH}</div>
          <div className="stat-unit">dKH</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Máximo</div>
          <div className="stat-value">{stats.maxKH}</div>
          <div className="stat-unit">dKH</div>
        </div>
      </div>

      {/* [INFORMAÇÕES] */}
      <div className="info-section">
        <h2>📊 Informações da Medição</h2>
        <p>Última atualização: <strong>{stats.lastUpdate || 'Nunca'}</strong></p>
        <p>Total de medições: <strong>{measurements.length}</strong></p>
      </div>

      {/* [TABELA] */}
      <div className="measurements-section">
        <h2>📈 Histórico de Medições</h2>
        
        {measurements.length === 0 ? (
          <div className="no-data">
            <p>Nenhuma medição disponível</p>
          </div>
        ) : (
          <div className="measurements-table">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>KH (dKH)</th>
                  <th>pH</th>
                  <th>Temperatura (°C)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {measurements.slice(0, 20).map((measurement, index) => (
                  <tr key={index}>
                    <td>{new Date(measurement.timestamp).toLocaleString('pt-BR')}</td>
                    <td className="kh-value">{measurement.kh.toFixed(2)}</td>
                    <td>{measurement.ph.toFixed(2)}</td>
                    <td>{measurement.temperature.toFixed(1)}</td>
                    <td>
                      <span className={`status ${measurement.status || 'success'}`}>
                        {measurement.status === 'error' ? '❌' : '✅'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* [AÇÕES] */}
      <div className="actions-section">
        <h2>⚙️ Ações</h2>
        <div className="action-buttons">
          <button className="action-button primary">
            ⚙️ Configurações
          </button>
          <button className="action-button secondary">
            📥 Exportar Dados
          </button>
          <button className="action-button secondary">
            🔧 Calibrar Sensores
          </button>
          <button className="action-button danger">
            🔄 Reset de Fábrica
          </button>
        </div>
      </div>
    </div>
  );
}
