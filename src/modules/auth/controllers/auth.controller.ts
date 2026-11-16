import { ApiEndpoint, userSchema, userExample } from '../../../common/swagger/api-docs';
import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiEndpoint(
    'Cadastrar usuário',
    'Cadastro público de ONG ou ADOTANTE. ADMIN não é permitido. Utilize um e-mail novo.',
    201,
    userSchema,
    { ...userExample, name: 'Maria Silva', email: 'maria@example.com' },
    {
      400: 'Perfil não permitido no cadastro público',
      409: 'E-mail já cadastrado',
      503: 'Não foi possível salvar os dados. Tente novamente.',
    },
  )
  @ApiBody({
    type: RegisterDto,
    examples: {
      adotante: {
        summary: 'Cadastrar adotante com e-mail novo',
        value: {
          name: 'Maria Silva',
          email: 'maria@example.com',
          password: 'Senha-segura-123',
          role: 'ADOTANTE',
        },
      },
      ong: {
        summary: 'Cadastrar ONG com e-mail novo',
        value: {
          name: 'ONG Cacoal',
          email: 'contato@ongcacoal.example',
          password: 'Senha-segura-123',
          role: 'ONG',
        },
      },
    },
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Chave única para repetir este cadastro sem duplicá-lo.',
  })
  @Post('register')
  register(@Body() body: RegisterDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.auth.register(body, idempotencyKey);
  }

  @ApiEndpoint(
    'Entrar na API',
    'Retorna um JWT HS256 válido por 24 horas. Cole o accessToken real em Authorize. O exemplo do token é ilustrativo.',
    201,
    {
      type: 'object',
      required: ['accessToken', 'user'],
      properties: {
        accessToken: {
          type: 'string',
          format: 'jwt',
          description: 'JWT HS256 válido por 24 horas.',
        },
        user: userSchema,
      },
    },
    {
      accessToken:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJyb2xlIjoiQURPVEFOVEUiLCJleHAiOjQ3MDAwMDAwMDB9.example-signature',
      user: userExample,
    },
    {
      400: 'Dados de entrada inválidos; message pode ser uma lista de validações.',
      401: 'E-mail ou senha inválidos',
    },
  )
  @ApiBody({ type: LoginDto })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }
}
