import { IsString, IsNumber, IsArray, ValidateNested, IsObject, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class PullRequestDto {
  @IsString()
  clientID: string;

  @IsObject()
  cookie: any;

  @IsNumber()
  @IsOptional()
  schemaVersion?: string;
}

export class MutationDto {
  @IsNumber()
  id: number;

  @IsString()
  name: string;

  // args can be any type (object, array, etc.) - no validation
  args?: any;
}

export class PushRequestDto {
  @IsString()
  clientID: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MutationDto)
  mutations: MutationDto[];

  @IsNumber()
  @IsOptional()
  schemaVersion?: string;
}
