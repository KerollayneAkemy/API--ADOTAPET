import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoginDto } from './login.dto';
import { Trim } from '../../../common/decorators/trim.decorator';

export class RegisterDto extends LoginDto {
  @ApiProperty({ example: 'Maria Silva' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: ['ONG', 'ADOTANTE'], default: 'ADOTANTE' })
  @IsIn(['ONG', 'ADOTANTE'])
  role: 'ONG' | 'ADOTANTE' = 'ADOTANTE';
}
