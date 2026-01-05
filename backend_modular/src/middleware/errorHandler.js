/**
 * Error Handler Middleware
 * Trata erros de forma centralizada
 */

const logger = require('../utils/logger');

/**
 * Custom Error Classes
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

class ValidationError extends AppError {
  constructor(message, errors = {}) {
    super(message, 400);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Middleware de tratamento de erros
 * Deve ser o último middleware registrado
 */
const errorHandler = (err, req, res, next) => {
  // Contexto do erro
  const context = {
    message: err.message,
    statusCode: err.statusCode || 500,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    deviceId: req.deviceId,
    timestamp: new Date().toISOString()
  };

  // Log apenas stack trace em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    context.stack = err.stack;
  }

  logger.error('Request error', context);

  // AppError (erro controlado)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.name,
      message: err.message,
      ...(err.errors && { errors: err.errors })
    });
  }

  // Erro de validação JWT
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      code: 'TOKEN_EXPIRED',
      message: 'Token expirado'
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Token inválido'
    });
  }

  // Erro de banco de dados
  if (err.code && err.code.startsWith('ER_')) {
    logger.error('Database error', { code: err.code, sqlMessage: err.sqlMessage });
    return res.status(400).json({
      success: false,
      code: 'DB_ERROR',
      message: 'Erro ao processar requisição'
    });
  }

  // Erro genérico/desconhecido
  res.status(err.statusCode || 500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' ? 
      'Erro interno do servidor' : 
      err.message
  });
};

/**
 * Middleware para rotas não encontradas
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: 'Rota não encontrada'
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError
};