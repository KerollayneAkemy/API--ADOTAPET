import { ApiEndpoint } from '../../../common/swagger/api-docs';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Saúde')
@Controller('health')
export class HealthController {
  @ApiEndpoint(
    'Verificar saúde da API',
    'Verifica apenas o processo local; não testa bancos externos.',
    200,
    {
      type: 'object',
      required: ['status', 'service', 'timestamp'],
      properties: {
        status: { type: 'string' },
        service: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
    { status: 'ok', service: 'adotapet-api', timestamp: '2026-11-18T00:00:00.000Z' },
  )
  @Get()
  health() {
    return { status: 'ok', service: 'adotapet-api', timestamp: new Date().toISOString() };
  }
}
