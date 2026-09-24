import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { PublicUser, User } from '../../../domain/entities';
import { hashPassword, matchesPassword } from '../../../common/security/password';
import { StoreService } from '../../../infrastructure/persistence/store.service';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(private readonly store: StoreService) {}

  register(data: RegisterDto): PublicUser {
    const role = data.role ?? 'ADOTANTE';
    if (role !== 'ONG' && role !== 'ADOTANTE') {
      throw new BadRequestException('Perfil não permitido no cadastro público');
    }
    const email = data.email.trim().toLowerCase();
    if ([...this.store.users.values()].some((user) => user.email === email)) {
      throw new ConflictException('E-mail já cadastrado');
    }
    const user: User = {
      id: randomUUID(),
      name: data.name,
      email,
      passwordHash: hashPassword(data.password),
      role,
    };
    this.store.commit(() => this.store.users.set(user.id, user));
    return this.toPublicUser(user);
  }

  login(data: LoginDto): { accessToken: string; user: PublicUser } {
    const email = data.email.trim().toLowerCase();
    const user = [...this.store.users.values()].find((candidate) => candidate.email === email);
    if (!user || !matchesPassword(data.password, user.passwordHash)) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    const now = Date.now();
    for (const [token, session] of this.store.sessions) {
      if (session.expiresAt <= now) this.store.sessions.delete(token);
    }
    const accessToken = randomBytes(32).toString('hex');
    this.store.sessions.set(accessToken, { userId: user.id, expiresAt: now + SESSION_DURATION_MS });
    return { accessToken, user: this.toPublicUser(user) };
  }

  getUserFromToken(token: string): PublicUser {
    const session = this.store.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      this.store.sessions.delete(token);
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    const user = this.store.users.get(session.userId);
    if (!user) throw new UnauthorizedException('Token inválido');
    return this.toPublicUser(user);
  }

  private toPublicUser(user: User): PublicUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
