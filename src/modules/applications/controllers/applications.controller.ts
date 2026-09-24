import {
  ApiEndpoint,
  applicationSchema,
  applicationExample,
} from '../../../common/swagger/api-docs';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiParam } from '@nestjs/swagger';
import { ApplicationsService } from '../services/applications.service';
import { AuthGuard, CurrentUser } from '../../auth/guards/auth.guard';
import { PublicUser } from '../../../domain/entities';
import { CreateApplicationDto } from '../dto/create-application.dto';

@ApiTags('Adoções')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @ApiParam({
    name: 'animalId',
    format: 'uuid',
    description: 'UUID real do animal, sem aspas.',
    example: applicationExample.animalId,
  })
  @ApiEndpoint(
    'Solicitar adoção',
    'Exclusivo para ADOTANTE. Exige animal disponível e ausência de outro pedido pendente do mesmo adotante. O motivo é opcional.',
    201,
    applicationSchema,
    applicationExample,
    {
      400: 'UUID ou corpo da requisição inválido.',
      401: 'Token inválido ou expirado',
      403: 'Apenas adotante pode solicitar adoção',
      404: 'Animal não encontrado',
      409: 'Você já possui uma solicitação pendente para este animal',
      503: 'Não foi possível salvar os dados. Tente novamente.',
    },
  )
  @Post('animals/:animalId/applications')
  create(
    @CurrentUser() user: PublicUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body() body: CreateApplicationDto,
  ) {
    return this.applications.create(user, animalId, body);
  }

  @ApiEndpoint(
    'Listar minhas solicitações',
    'ADOTANTE vê seus pedidos. ONG e ADMIN veem os pedidos dos seus animais. Pode retornar uma lista vazia.',
    200,
    { type: 'array', items: applicationSchema },
    [applicationExample],
    { 401: 'Token inválido ou expirado' },
  )
  @Get('applications/me')
  mine(@CurrentUser() user: PublicUser) {
    return this.applications.mine(user);
  }

  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'UUID da solicitação, não do animal.',
    example: applicationExample.id,
  })
  @ApiEndpoint(
    'Aprovar solicitação',
    'Exige ONG ou ADMIN responsável. Aprova o pedido, marca o animal ADOTADO e recusa os demais pendentes. Não recebe corpo.',
    200,
    applicationSchema,
    { ...applicationExample, status: 'APROVADA' },
    {
      400: 'Validation failed (uuid is expected)',
      401: 'Token inválido ou expirado',
      403: 'Você não é responsável por este animal',
      404: 'Solicitação não encontrada',
      409: 'Solicitação já foi analisada',
      503: 'Não foi possível salvar os dados. Tente novamente.',
    },
  )
  @Patch('applications/:id/approve')
  approve(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.decide(user, id, true);
  }

  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'UUID da solicitação, não do animal.',
    example: applicationExample.id,
  })
  @ApiEndpoint(
    'Recusar solicitação',
    'Exige ONG ou ADMIN responsável. Recusa o pedido pendente sem alterar o animal. Não recebe corpo.',
    200,
    applicationSchema,
    { ...applicationExample, status: 'RECUSADA' },
    {
      400: 'Validation failed (uuid is expected)',
      401: 'Token inválido ou expirado',
      403: 'Você não é responsável por este animal',
      404: 'Solicitação não encontrada',
      409: 'Solicitação já foi analisada',
      503: 'Não foi possível salvar os dados. Tente novamente.',
    },
  )
  @Patch('applications/:id/reject')
  reject(@CurrentUser() user: PublicUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.decide(user, id, false);
  }
}
