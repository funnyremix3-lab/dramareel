import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException, ErrorCode } from './app-exception';

interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const HTTP_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/** Maps every error to `{ error: { code, message, details, requestId } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { status, body } = this.toError(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, path: req.url }, 'Unhandled error');
    }

    res.status(status).json({ error: { ...body, requestId: req.id } });
  }

  private toError(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppException) {
      const { code, message, details } = exception.getResponse() as ErrorBody;
      return { status: exception.getStatus(), body: { code, message, details } };
    }
    if (exception instanceof ThrottlerException) {
      return { status: 429, body: { code: 'RATE_LIMITED', message: 'Too many requests' } };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const raw = typeof response === 'string' ? response : (response as { message?: unknown }).message;
      // class-validator returns an array of messages
      const details = Array.isArray(raw) ? { fields: raw } : undefined;
      const message = Array.isArray(raw) ? 'Request validation failed' : String(raw ?? exception.message);
      return { status, body: { code: HTTP_TO_CODE[status] ?? 'INTERNAL', message, details } };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return { status: 409, body: { code: 'CONFLICT', message: 'Resource already exists' } };
      if (exception.code === 'P2025') return { status: 404, body: { code: 'NOT_FOUND', message: 'Resource not found' } };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL', message: 'Something went wrong' },
    };
  }
}
