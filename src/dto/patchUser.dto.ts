import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class PatchUserDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsMongoId()
  addRoleId?: string;

  @IsOptional()
  @IsMongoId()
  removeRoleId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "password must be at least 8 characters" })
  @MaxLength(72, { message: "password must be at most 72 characters" })
  password?: string;
}
