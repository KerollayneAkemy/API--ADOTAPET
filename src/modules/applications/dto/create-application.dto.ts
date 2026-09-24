import { IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Trim } from '../../../common/decorators/trim.decorator';

export class CreateApplicationDto {
  @ApiPropertyOptional({
    default: '',
    example: 'Quero oferecer um lar seguro e carinhoso.',
    maxLength: 3000,
  })
  @Trim()
  @IsString()
  @MaxLength(3000)
  reason = '';
}
