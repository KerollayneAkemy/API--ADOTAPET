import { ApiEndpoint, animalSchema, animalExample } from '../../../common/swagger/api-docs';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiParam } from '@nestjs/swagger';
import { AnimalsService } from '../services/animals.service';
import { AuthGuard, CurrentUser } from '../../auth/guards/auth.guard';
import { PublicUser } from '../../../domain/entities';
import { CreateAnimalDto } from '../dto/create-animal.dto';
import { ListAnimalsDto } from '../dto/list-animals.dto';

@ApiTags('Animais')
@Controller('animals')
export class AnimalsController {
  constructor(private readonly animals: AnimalsService) {}

  @ApiEndpoint(
    'Listar animais',
    'Consulta pública, sem paginação. Filtros opcionais. Copie um id retornado para usar nas outras rotas. Pode retornar uma lista vazia.',
    200,
    { type: 'array', items: animalSchema },
    [animalExample],
    { 400: 'Filtro inválido; status deve ser DISPONIVEL ou ADOTADO.' },
  )
  @Get()
  list(@Query() query: ListAnimalsDto) {
    return this.animals.list(query);
  }

  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'UUID real obtido na listagem, sem aspas.',
    example: animalExample.id,
  })
  @ApiEndpoint(
    'Consultar animal',
    'Busca pelo UUID. Os IDs dos exemplos são ilustrativos.',
    200,
    animalSchema,
    animalExample,
    { 400: 'Validation failed (uuid is expected)', 404: 'Animal não encontrado' },
  )
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.animals.get(id);
  }

  @ApiEndpoint(
    'Cadastrar animal',
    'Permitido a ONG ou ADMIN. id, ongId e status são definidos pelo servidor; não os envie no corpo.',
    201,
    animalSchema,
    animalExample,
    {
      400: 'Dados inválidos ou campos não permitidos.',
      401: 'Informe Authorization: Bearer <token>',
      403: 'Apenas ONG ou administrador pode cadastrar animais',
      503: 'Não foi possível salvar os dados. Tente novamente.',
    },
  )
  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(@CurrentUser() user: PublicUser, @Body() body: CreateAnimalDto) {
    return this.animals.create(user, body);
  }
}
