import { IsOptional, IsInt, Min, Max, IsString, IsNotEmpty } from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses?: number = 100;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080) // max 7 days in minutes
  expiresInMinutes?: number;
}

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}