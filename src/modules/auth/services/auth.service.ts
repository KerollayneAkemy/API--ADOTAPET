import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { PublicUser, User } from '../../../domain/entities';
import { hashPassword, matchesPassword } from '../../../common/security/password';
import { signAccessToken, verifyAccessToken } from '../../../common/security/jwt';
import {
  DatabaseService,
  isUniqueViolation,
} from '../../../infrastructure/persistence/database.service';
import { IdempotencyService } from '../../../infrastructure/persistence/idempotency.service';
import { logJson } from '../../../common/observability/json-logger';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async register(data: RegisterDto, idempotencyKey?: string): Promise<PublicUser> {
    const role = data.role ?? 'ADOTANTE';
    if (role !== 'ONG' && role !== 'ADOTANTE')
      throw new BadRequestException('Perfil não permitido no cadastro público');
    const user: User = {
      id: randomUUID(),
      name: data.name,
      email: data.email.trim().toLowerCase(),
      passwordHash: hashPassword(data.password),
      role,
    };
    const result = await this.idempotency.execute(
      'public:POST:/auth/register',
      idempotencyKey,
      data,
      async (client) => {
        try {
          await client.query(
            'INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)',
            [user.id, user.name, user.email, user.passwordHash, user.role],
          );
        } catch (error) {
          if (isUniqueViolation(error)) throw new ConflictException('E-mail já cadastrado');
          throw error;
        }
        return this.toPublicUser(user);
      },
    );
    logJson('info', 'auth.registration', { userId: result.body.id, role: result.body.role });
    return result.body;
  }

  async login(data: LoginDto): Promise<{ accessToken: string; user: PublicUser }> {
    const result = await this.database.query<User>(
      'SELECT id,name,email,password_hash AS "passwordHash",role FROM users WHERE email=$1',
      [data.email.trim().toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || !matchesPassword(data.password, user.passwordHash)) {
      logJson('warn', 'auth.login_failed', { reason: 'invalid_credentials' });
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    logJson('info', 'auth.login_succeeded', { userId: user.id, role: user.role });
    return { accessToken: signAccessToken(user.id, user.role), user: this.toPublicUser(user) };
  }

  async getUserFromToken(token: string): Promise<PublicUser> {
    const claims = verifyAccessToken(token);
    if (!claims) throw new UnauthorizedException('Token inválido ou expirado');
    const result = await this.database.query<User>(
      'SELECT id,name,email,role FROM users WHERE id=$1',
      [claims.sub],
    );
    const user = result.rows[0];
    if (!user || user.role !== claims.role) throw new UnauthorizedException('Token inválido');
    return this.toPublicUser(user);
  }

  private toPublicUser(user: Pick<User, 'id' | 'name' | 'email' | 'role'>): PublicUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
