import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../common/decorators/trim.decorator';

export class LoginDto {
  @ApiProperty({ example: 'adotante@adotapet.local' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 6,
    maxLength: 128,
    example: '123456',
    description: 'Senha da conta; exemplo das contas locais.',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
