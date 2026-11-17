import { ApiEndpoint, animalSchema, animalExample } from '../../../common/swagger/api-docs';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiHeader,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AnimalsService } from '../services/animals.service';
import { AuthGuard, CurrentUser } from '../../auth/guards/auth.guard';
import { PublicUser } from '../../../domain/entities';
import { CreateAnimalDto } from '../dto/create-animal.dto';
import { ListAnimalsDto } from '../dto/list-animals.dto';

// Expõe as rotas HTTP de animais e delega as regras ao serviço do módulo.
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
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Chave única com 8 a 128 caracteres para repetir a criação sem duplicá-la.',
    schema: { type: 'string', minLength: 8, maxLength: 128 },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(
    @CurrentUser() user: PublicUser,
    @Body() body: CreateAnimalDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.animals.create(user, body, idempotencyKey);
  }

  @Post(':id/photos')
  @HttpCode(201)
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID do animal que receberá a foto.' })
  @ApiEndpoint(
    'Enviar foto do animal',
    'Exige ONG ou ADMIN responsável. Aceita JPEG, PNG ou WebP de até 8 MiB. O bucket R2 permanece privado e o acesso é redirecionado por URL assinada temporária.',
    201,
    {
      type: 'object',
      required: ['animal', 'photoUrl'],
      properties: { animal: animalSchema, photoUrl: { type: 'string', format: 'uri-reference' } },
    },
    {
      animal: animalExample,
      photoUrl:
        '/api/animals/22222222-2222-4222-8222-222222222222/photos/a1b2c3d4-e5f6-4789-8123-abcdefabcdef.jpg',
    },
    {
      400: 'Imagem inválida ou não enviada.',
      401: 'Token inválido ou expirado',
      403: 'Você não é responsável por este animal',
      404: 'Animal não encontrado',
      413: 'A imagem excede 8 MiB.',
      503: 'Upload do R2 indisponível ou não configurado.',
    },
  )
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Chave única com 8 a 128 caracteres para evitar upload duplicado.',
    schema: { type: 'string', minLength: 8, maxLength: 128 },
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        const valid = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
        callback(
          valid ? null : new BadRequestException('Envie uma imagem JPEG, PNG ou WebP.'),
          valid,
        );
      },
    }),
  )
  uploadPhoto(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo de imagem obrigatório.');
    return this.animals.uploadPhoto(user, id, file, idempotencyKey);
  }

  @Get(':id/photos/:photoId')
  @ApiParam({ name: 'id', format: 'uuid', description: 'UUID do animal.' })
  @ApiResponse({
    status: 302,
    description: 'Redireciona para URL assinada temporária de objeto no R2 privado.',
  })
  @ApiResponse({ status: 404, description: 'Foto não vinculada ao animal.' })
  @Redirect()
  async getPhoto(@Param('id', ParseUUIDPipe) id: string, @Param('photoId') photoId: string) {
    return { url: await this.animals.getPhotoReadUrl(id, photoId), statusCode: 302 };
  }
}
