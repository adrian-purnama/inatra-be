import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateExternalOrgDto {
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
