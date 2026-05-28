import { IsBoolean, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateFolderNodeDto {
  @IsString()
  @MinLength(1, { message: "namespace is required" })
  @MaxLength(50, { message: "namespace is too long" })
  namespace!: string;

  @IsOptional()
  @IsMongoId({ message: "parentId must be a valid mongo id" })
  parentId?: string | null;

  @IsString()
  @MinLength(1, { message: "name is required" })
  @MaxLength(200, { message: "name is too long" })
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

