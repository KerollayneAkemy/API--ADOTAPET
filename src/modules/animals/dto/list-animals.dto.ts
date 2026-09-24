import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AnimalStatus } from '../../../domain/entities';

export class ListAnimalsDto {
  @ApiPropertyOptional({ example: 'CACHORRO', description: 'Espécie com comparação exata.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  species?: string;

  @ApiPropertyOptional({
    example: 'São Paulo',
    description: 'Cidade sem diferenciar maiúsculas e minúsculas.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ enum: ['DISPONIVEL', 'ADOTADO'], example: 'DISPONIVEL' })
  @IsOptional()
  @IsIn(['DISPONIVEL', 'ADOTADO'])
  status?: AnimalStatus;
}
