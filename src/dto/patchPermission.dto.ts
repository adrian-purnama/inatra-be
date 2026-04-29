import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PatchPermissionDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "name must be a non-empty string" })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "description is too long" })
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(["auto", "custom", "all_user", "all_guest"], {
    message: 'source must be one of: "auto", "custom", "all_user", "all_guest"',
  })
  source?: "auto" | "custom" | "all_user" | "all_guest";
}
