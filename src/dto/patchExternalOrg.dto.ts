import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PatchExternalOrgDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "name must not be empty" })
  @MaxLength(200, { message: "name is too long" })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: "description must not be empty" })
  @MaxLength(500, { message: "description is too long" })
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
