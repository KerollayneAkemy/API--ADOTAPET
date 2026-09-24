import { IsInt, IsNotEmpty, IsString, Length, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from '../../../common/decorators/trim.decorator';

export class CreateAnimalDto {
  @ApiProperty({ example: 'Luna' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'CACHORRO' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  species!: string;

  @ApiProperty({ example: 'SRD' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  breed!: string;

  @ApiProperty({ example: 'FEMEA' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  sex!: string;

  @ApiProperty({ example: 'MEDIO' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  size!: string;

  @ApiProperty({ example: 'Cacoal' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @ApiProperty({ example: 'RO', minLength: 2, maxLength: 2 })
  @Trim()
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiProperty({ minimum: 0, example: 2 })
  @IsInt()
  @Min(0)
  age!: number;

  @ApiProperty({ example: 'Animal dócil, disponível para adoção.' })
  @Trim()
  @IsString()
  @MaxLength(3000)
  description!: string;
}
