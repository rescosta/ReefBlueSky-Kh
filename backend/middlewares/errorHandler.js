/**
 * Middleware Global de Tratamento de Erros
 * Captura erros de todas as rotas e retorna JSON padronizado
 */
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR HANDLER]', {
    method: req.method,
    url: req.url,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Erros de banco MariaDB
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    return res.status(503).json({
      success: false,
      message: 'Credenciais do banco incorretas'
    });
  }
  if (err.code === 'ER_BAD_DB_ERROR') {
    return res.status(503).json({
      success: false,
      message: 'Banco de dados não existe'
    });
  }
  if (err.message.includes('timeout')) {
    return res.status(503).json({
      success: false,
      message: 'Timeout no banco (MariaDB pode estar DOWN)'
    });
  }

  // Erro genérico
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erro interno do servidor'
  });
};

module.exports = errorHandler;
