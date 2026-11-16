import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../common/decorators/trim.decorator';

export class LoginDto {
  @ApiProperty({ example: 'maria@example.test' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 6,
    maxLength: 128,
    example: 'senha-segura-123',
    description: 'Senha definida ao cadastrar a conta. O exemplo não é uma credencial real.',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
