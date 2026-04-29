import { IsBoolean, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateLocationDto {
  @IsString()
  @MinLength(1, { message: "name is required" })
  @MaxLength(200, { message: "name is too long" })
  name!: string;

  @IsString()
  @IsIn(["country", "province", "regency", "district"])
  level!: "country" | "province" | "regency" | "district";

  @IsOptional()
  @IsMongoId({ message: "parentId must be a mongodb id" })
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
