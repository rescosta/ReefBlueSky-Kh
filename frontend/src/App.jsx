/**
 * ReefBlueSky KH Monitor - Frontend React
 * Aplicação web com autenticação JWT, dashboard de medições e controle de dispositivos
 * 
 * Funcionalidades:
 * - Login com JWT
 * - Dashboard com histórico de medições
 * - Gráficos de tendências
 * - Controle de dispositivos
 * - Configurações do sistema
 * - Integração com backend Node.js
 */

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// [SEGURANÇA] Configuração do Axios com interceptores
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://seu-dominio.com/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// [SEGURANÇA] Interceptor para adicionar token JWT
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// [SEGURANÇA] Interceptor para renovar token se expirado
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 403 && !originalRequest._retry) {
            originalRequest._retry = true;
            
            try {
                const refreshToken = localStorage.getItem('refreshToken');
                const response = await axios.post(
                    `${API_BASE_URL}/v1/device/refresh-token`,
                    { refreshToken }
                );
                
                const { token } = response.data.data;
                localStorage.setItem('token', token);
                
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh falhou, fazer logout
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }
        
        return Promise.reject(error);
    }
);

// ============================================================================
// [COMPONENTES] Login
// ============================================================================

function LoginPage() {
    const [formData, setFormData] = useState({
        deviceId: '',
        username: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        try {
            // [SEGURANÇA] Registrar dispositivo e obter token
            const response = await api.post('/v1/device/register', formData);
            
            const { token, refreshToken } = response.data.data;
            
            // [SEGURANÇA] Armazenar tokens
            localStorage.setItem('token', token);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('deviceId', formData.deviceId);
            
            // Redirecionar para dashboard
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err.response?.data?.message || 'Erro ao fazer login');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="login-container">
            <div className="login-card">
                <h1>🐠 ReefBlueSky KH Monitor</h1>
                <p>Autenticação de Dispositivo</p>
                
                {error && <div className="error-message">{error}</div>}
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>ID do Dispositivo</label>
                        <input
                            type="text"
                            name="deviceId"
                            value={formData.deviceId}
                            onChange={handleChange}
                            placeholder="Ex: device-123456"
                            required
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Usuário/Email</label>
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            placeholder="seu@email.com"
                            required
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Senha</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Sua senha"
                            required
                        />
                    </div>
                    
                    <button type="submit" disabled={loading}>
                        {loading ? 'Autenticando...' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ============================================================================
// [COMPONENTES] Dashboard
// ============================================================================

function Dashboard() {
    const [measurements, setMeasurements] = useState([]);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // [FUNCIONALIDADE] Carregar dados ao iniciar
    useEffect(() => {
        loadData();
        
        // [FUNCIONALIDADE] Atualizar dados a cada 30 segundos
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, []);
    
    const loadData = useCallback(async () => {
        try {
            // Fazer ping para verificar conexão
            await api.get('/v1/device/ping');
            
            // TODO: Carregar medições do backend
            // TODO: Carregar métricas de saúde
            
            setError('');
        } catch (err) {
            setError('Erro ao carregar dados: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, []);
    
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('deviceId');
        window.location.href = '/login';
    };
    
    if (loading) {
        return <div className="loading">Carregando...</div>;
    }
    
    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h1>🐠 ReefBlueSky KH Monitor</h1>
                <button onClick={handleLogout} className="logout-btn">Sair</button>
            </header>
            
            {error && <div className="error-message">{error}</div>}
            
            <div className="dashboard-grid">
                {/* Seção: Status Atual */}
                <section className="card">
                    <h2>Status Atual</h2>
                    <div className="status-grid">
                        <div className="status-item">
                            <span className="label">KH</span>
                            <span className="value">8.5 dKH</span>
                        </div>
                        <div className="status-item">
                            <span className="label">pH Ref</span>
                            <span className="value">8.2</span>
                        </div>
                        <div className="status-item">
                            <span className="label">Temperatura</span>
                            <span className="value">25.3°C</span>
                        </div>
                        <div className="status-item">
                            <span className="label">Última Medição</span>
                            <span className="value">5 min atrás</span>
                        </div>
                    </div>
                </section>
                
                {/* Seção: Histórico de Medições */}
                <section className="card">
                    <h2>Histórico de Medições</h2>
                    <div className="measurements-list">
                        {measurements.length === 0 ? (
                            <p>Nenhuma medição disponível</p>
                        ) : (
                            measurements.map((m, idx) => (
                                <div key={idx} className="measurement-item">
                                    <span>{new Date(m.timestamp).toLocaleString()}</span>
                                    <span>KH: {m.kh} dKH</span>
                                </div>
                            ))
                        )}
                    </div>
                </section>
                
                {/* Seção: Saúde do Sistema */}
                <section className="card">
                    <h2>Saúde do Sistema</h2>
                    {health ? (
                        <div className="health-metrics">
                            <div className="metric">
                                <span>CPU</span>
                                <div className="progress-bar">
                                    <div 
                                        className="progress-fill" 
                                        style={{ width: `${health.cpu_usage}%` }}
                                    ></div>
                                </div>
                                <span>{health.cpu_usage}%</span>
                            </div>
                            <div className="metric">
                                <span>Memória</span>
                                <div className="progress-bar">
                                    <div 
                                        className="progress-fill" 
                                        style={{ width: `${health.memory_usage}%` }}
                                    ></div>
                                </div>
                                <span>{health.memory_usage}%</span>
                            </div>
                            <div className="metric">
                                <span>WiFi</span>
                                <span>{health.wifi_signal_strength} dBm</span>
                            </div>
                        </div>
                    ) : (
                        <p>Aguardando dados...</p>
                    )}
                </section>
                
                {/* Seção: Controles */}
                <section className="card">
                    <h2>Controles</h2>
                    <div className="controls-grid">
                        <button className="control-btn">Iniciar Medição</button>
                        <button className="control-btn">Parar Medição</button>
                        <button className="control-btn">Calibrar KH</button>
                        <button className="control-btn">Configurações</button>
                    </div>
                </section>
            </div>
        </div>
    );
}

// ============================================================================
// [COMPONENTES] Roteamento
// ============================================================================

function PrivateRoute({ children }) {
    const token = localStorage.getItem('token');
    return token ? children : <Navigate to="/login" />;
}

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route 
                    path="/dashboard" 
                    element={
                        <PrivateRoute>
                            <Dashboard />
                        </PrivateRoute>
                    } 
                />
                <Route path="/" element={<Navigate to="/dashboard" />} />
            </Routes>
        </Router>
    );
}
