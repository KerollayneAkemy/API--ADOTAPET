import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { logJson } from './json-logger';

type RequestWithId = Request & { requestId?: string };

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const databaseError =
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof exception.code === 'string' &&
      /^(08|23|53|57|ECONN|ETIMEDOUT)/.test(exception.code);
    const multerCode =
      exception instanceof Error && exception.name === 'MulterError' && 'code' in exception
        ? exception.code
        : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : databaseError
          ? HttpStatus.SERVICE_UNAVAILABLE
          : multerCode === 'LIMIT_FILE_SIZE'
            ? HttpStatus.PAYLOAD_TOO_LARGE
            : multerCode
              ? HttpStatus.BAD_REQUEST
              : HttpStatus.INTERNAL_SERVER_ERROR;

    const original = exception instanceof HttpException ? exception.getResponse() : null;
    const originalMessage =
      typeof original === 'object' && original && 'message' in original
        ? (original as { message: string | string[] }).message
        : exception instanceof HttpException
          ? exception.message
          : undefined;
    const detail =
      status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Ocorreu um erro interno.'
        : status === HttpStatus.SERVICE_UNAVAILABLE && databaseError
          ? 'Serviço temporariamente indisponível.'
          : Array.isArray(originalMessage)
            ? 'A requisição contém erros de validação.'
            : (originalMessage ?? 'A requisição não pôde ser concluída.');
    const title = (HttpStatus[status] ?? 'Error')
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
    const requestId = request.requestId ?? 'unknown';
    const problem = {
      type: 'about:blank',
      title,
      status,
      detail,
      instance: request.path,
      requestId,
      ...(Array.isArray(originalMessage) ? { errors: originalMessage } : {}),
    };

    logJson(status >= 500 ? 'error' : 'warn', 'http.problem', {
      status,
      path: request.path,
      method: request.method,
      errorType: exception instanceof Error ? exception.name : typeof exception,
    });
    response.status(status).type('application/problem+json').json(problem);
  }
}
