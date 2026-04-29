import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateMarketSegmentDto {
  @IsString()
  @MinLength(1, { message: "code is required" })
  @MaxLength(50, { message: "code is too long" })
  code!: string;

  @IsString()
  @MinLength(1, { message: "name is required" })
  @MaxLength(200, { message: "name is too long" })
  name!: string;

  @IsString()
  @MinLength(1, { message: "description is required" })
  @MaxLength(500, { message: "description is too long" })
  description!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
