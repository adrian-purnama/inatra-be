import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PatchProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "name must not be empty" })
  @MaxLength(200, { message: "name is too long" })
  name?: string;

  @IsOptional()
  @IsMongoId({ message: "folderId must be a valid mongo id" })
  folderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: "unit is too long" })
  unit?: string;
}

