import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreatePermissionDto {
  @IsString()
  @MinLength(1, { message: "path is required" })
  path!: string;

  @IsString()
  @MinLength(1, { message: "method is required" })
  method!: string;

  @IsIn(["auto", "custom", "all_user", "all_guest"], {
    message: 'mode must be one of: "auto", "custom", "all_user", "all_guest"',
  })
  mode!: "auto" | "custom" | "all_user" | "all_guest";

  @IsOptional()
  @IsString()
  @MinLength(1, { message: "name must be a non-empty string" })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "description is too long" })
  description?: string;
}
