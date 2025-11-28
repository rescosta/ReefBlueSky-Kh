/**
 * ReefBlueSky KH Monitor - Autenticação JWT
 * 
 * Gerencia tokens JWT, refresh tokens e autenticação do usuário
 */

// [AUTH] Configurações
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';
const TOKEN_KEY = 'reefbluesky_token';
const REFRESH_TOKEN_KEY = 'reefbluesky_refresh_token';
const TOKEN_EXPIRY_KEY = 'reefbluesky_token_expiry';

/**
 * [AUTH] Classe para gerenciar autenticação
 */
export class AuthService {
  /**
   * [AUTH] Fazer login
   */
  static async login(email, password) {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Falha no login');
      }

      const data = await response.json();
      
      // [AUTH] Armazenar tokens
      this.setToken(data.token);
      this.setRefreshToken(data.refreshToken);
      
      // [AUTH] Armazenar tempo de expiração
      const expiryTime = new Date().getTime() + (15 * 60 * 1000); // 15 minutos
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());

      return {
        success: true,
        user: data.user,
      };
    } catch (error) {
      console.error('[AUTH] Erro no login:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * [AUTH] Fazer logout
   */
  static logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }

  /**
   * [AUTH] Registrar novo usuário
   */
  static async register(email, password, name) {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Falha no registro');
      }

      const data = await response.json();
      
      // [AUTH] Armazenar tokens após registro
      this.setToken(data.token);
      this.setRefreshToken(data.refreshToken);

      return {
        success: true,
        user: data.user,
      };
    } catch (error) {
      console.error('[AUTH] Erro no registro:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * [AUTH] Renovar token
   */
  static async refreshToken() {
    try {
      const refreshToken = this.getRefreshToken();
      
      if (!refreshToken) {
        throw new Error('Refresh token não encontrado');
      }

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // [AUTH] Se refresh falhar, fazer logout
        this.logout();
        throw new Error('Falha ao renovar token');
      }

      const data = await response.json();
      
      // [AUTH] Armazenar novo token
      this.setToken(data.token);
      
      // [AUTH] Atualizar tempo de expiração
      const expiryTime = new Date().getTime() + (15 * 60 * 1000);
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());

      return {
        success: true,
        token: data.token,
      };
    } catch (error) {
      console.error('[AUTH] Erro ao renovar token:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * [AUTH] Obter token atual
   */
  static getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * [AUTH] Armazenar token
   */
  static setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * [AUTH] Obter refresh token
   */
  static getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * [AUTH] Armazenar refresh token
   */
  static setRefreshToken(refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  /**
   * [AUTH] Verificar se token está expirado
   */
  static isTokenExpired() {
    const expiryTime = localStorage.getItem(TOKEN_EXPIRY_KEY);
    
    if (!expiryTime) {
      return true;
    }

    return new Date().getTime() > parseInt(expiryTime);
  }

  /**
   * [AUTH] Verificar se está autenticado
   */
  static isAuthenticated() {
    const token = this.getToken();
    return token && !this.isTokenExpired();
  }

  /**
   * [AUTH] Obter informações do usuário
   */
  static async getCurrentUser() {
    try {
      // [AUTH] Renovar token se expirado
      if (this.isTokenExpired()) {
        const refreshResult = await this.refreshToken();
        if (!refreshResult.success) {
          return { success: false, error: 'Token expirado' };
        }
      }

      const token = this.getToken();
      
      const response = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Falha ao obter usuário');
      }

      const data = await response.json();
      return {
        success: true,
        user: data.user,
      };
    } catch (error) {
      console.error('[AUTH] Erro ao obter usuário:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * [AUTH] Fazer requisição autenticada
   */
  static async fetch(url, options = {}) {
    try {
      // [AUTH] Renovar token se expirado
      if (this.isTokenExpired()) {
        const refreshResult = await this.refreshToken();
        if (!refreshResult.success) {
          throw new Error('Token expirado, faça login novamente');
        }
      }

      const token = this.getToken();
      
      const response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // [AUTH] Se receber 401, fazer logout
      if (response.status === 401) {
        this.logout();
        throw new Error('Sessão expirada, faça login novamente');
      }

      return response;
    } catch (error) {
      console.error('[AUTH] Erro na requisição:', error);
      throw error;
    }
  }
}

/**
 * [AUTH] Hook React para autenticação
 */
export function useAuth() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    // [AUTH] Carregar usuário ao montar
    const loadUser = async () => {
      if (AuthService.isAuthenticated()) {
        const result = await AuthService.getCurrentUser();
        if (result.success) {
          setUser(result.user);
        } else {
          setError(result.error);
          AuthService.logout();
        }
      }
      setLoading(false);
    };

    loadUser();
  }, []);

  return {
    user,
    loading,
    error,
    login: AuthService.login.bind(AuthService),
    logout: () => {
      AuthService.logout();
      setUser(null);
    },
    register: AuthService.register.bind(AuthService),
    isAuthenticated: AuthService.isAuthenticated.bind(AuthService),
  };
}

/**
 * [AUTH] Contexto de autenticação
 */
export const AuthContext = React.createContext();

export function AuthProvider({ children }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return React.useContext(AuthContext);
}
