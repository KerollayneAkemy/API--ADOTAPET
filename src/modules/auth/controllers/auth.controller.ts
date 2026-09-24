import { ApiEndpoint, userSchema, userExample } from '../../../common/swagger/api-docs';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
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
          password: '123456',
          role: 'ADOTANTE',
        },
      },
      ong: {
        summary: 'Cadastrar ONG com e-mail novo',
        value: {
          name: 'ONG Cacoal',
          email: 'contato@ongcacoal.example',
          password: '123456',
          role: 'ONG',
        },
      },
    },
  })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @ApiEndpoint(
    'Entrar na API',
    'Retorna token opaco com validade de 24 horas; não é JWT. Cole o accessToken real em Authorize. Reiniciar a API invalida as sessões. O exemplo de token é ilustrativo.',
    201,
    {
      type: 'object',
      required: ['accessToken', 'user'],
      properties: {
        accessToken: { type: 'string', minLength: 64, maxLength: 64 },
        user: userSchema,
      },
    },
    { accessToken: 'a'.repeat(64), user: userExample },
    {
      400: 'Dados de entrada inválidos; message pode ser uma lista de validações.',
      401: 'E-mail ou senha inválidos',
    },
  )
  @ApiBody({
    type: LoginDto,
    examples: {
      adotante: {
        summary: 'Entrar como adotante de demonstração',
        value: { email: 'adotante@adotapet.local', password: '123456' },
      },
      ong: {
        summary: 'Entrar como ONG de demonstração',
        value: { email: 'ong@adotapet.local', password: '123456' },
      },
      admin: {
        summary: 'Entrar como administrador de demonstração',
        value: { email: 'admin@adotapet.local', password: '123456' },
      },
    },
  })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }
}
