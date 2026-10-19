import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateServerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class UpdateServerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}