import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PatchMarketSegmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "code must not be empty" })
  @MaxLength(50, { message: "code is too long" })
  code?: string;

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
