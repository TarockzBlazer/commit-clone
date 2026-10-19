import { IsString, IsNotEmpty, MinLength, MaxLength, IsIn } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['text', 'voice'])
  type!: 'text' | 'voice';
}

export class UpdateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}