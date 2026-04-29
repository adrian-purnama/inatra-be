import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateRoleDto {
  @IsString()
  @MinLength(1, { message: "name is required" })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "description is too long" })
  description?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  permissionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsBoolean()
  applyOnRegisterUser?: boolean;
}
