/**
 * ReefBlueSky KH Monitor - Componente de Login
 */

import React, { useState } from 'react';
import { AuthService } from '../auth';
import './Login.css';

export function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // [VALIDAÇÃO] Validar email
    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      setError('Email inválido');
      setLoading(false);
      return;
    }

    // [VALIDAÇÃO] Validar senha
    if (!password || password.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres');
      setLoading(false);
      return;
    }

    try {
      const result = await AuthService.login(email, password);
      
      if (result.success) {
        console.log('[LOGIN] ✅ Login bem-sucedido');
        onLoginSuccess(result.user);
      } else {
        setError(result.error || 'Falha no login');
      }
    } catch (err) {
      setError('Erro ao fazer login: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🌊 ReefBlueSky</h1>
          <p>KH Monitor</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu-email@exemplo.com"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                disabled={loading}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? '⏳ Entrando...' : '🔓 Entrar'}
          </button>
        </form>

        <div className="login-footer">
          <p>Não tem conta? <a href="#register">Registre-se aqui</a></p>
          <p><a href="#forgot">Esqueceu a senha?</a></p>
        </div>
      </div>

      <div className="login-info">
        <h2>Bem-vindo ao ReefBlueSky KH Monitor</h2>
        <p>Sistema de monitoramento de alcalinidade para aquários marinhos</p>
        
        <div className="features">
          <div className="feature">
            <span className="icon">📊</span>
            <h3>Dashboard em Tempo Real</h3>
            <p>Monitore suas medições de KH em tempo real</p>
          </div>
          
          <div className="feature">
            <span className="icon">🔒</span>
            <h3>Seguro e Confiável</h3>
            <p>Autenticação JWT com criptografia de ponta a ponta</p>
          </div>
          
          <div className="feature">
            <span className="icon">📱</span>
            <h3>Responsivo</h3>
            <p>Acesse de qualquer dispositivo (desktop, tablet, mobile)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
