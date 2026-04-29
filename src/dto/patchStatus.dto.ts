import { IsBoolean, IsHexColor, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PatchStatusDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "name must not be empty" })
  @MaxLength(200, { message: "name is too long" })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "description is too long" })
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: "category must not be empty" })
  @MaxLength(80, { message: "category is too long" })
  category?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
