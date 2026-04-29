import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PatchAppDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "appName must not be empty" })
  @MaxLength(200, { message: "appName is too long" })
  appName?: string;

  /** Logo URL or path served to clients (same as public branding) */
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "appLogo is too long" })
  appLogo?: string;

  @IsOptional()
  @IsBoolean()
  openRegister?: boolean;

  @IsOptional()
  @IsBoolean()
  openLogin?: boolean;
}
