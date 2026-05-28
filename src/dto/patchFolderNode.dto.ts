import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PatchFolderNodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "name must not be empty" })
  @MaxLength(200, { message: "name is too long" })
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

