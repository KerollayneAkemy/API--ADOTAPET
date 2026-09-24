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
      required: ['status', 'service', 'mode'],
      properties: {
        status: { type: 'string' },
        service: { type: 'string' },
        mode: { type: 'string' },
      },
    },
    { status: 'ok', service: 'adotapet-api', mode: 'local-sem-docker' },
  )
  @Get()
  health() {
    return { status: 'ok', service: 'adotapet-api', mode: 'local-sem-docker' };
  }
}
