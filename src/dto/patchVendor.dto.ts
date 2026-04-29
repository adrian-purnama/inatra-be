import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class PatchVendorDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "vendorName must not be empty" })
  @MaxLength(200, { message: "vendorName is too long" })
  vendorName?: string;

  @IsOptional()
  @IsArray({ message: "vendorCategoryIds must be an array" })
  @ArrayUnique()
  @IsMongoId({ each: true, message: "vendorCategoryIds must contain mongodb ids" })
  vendorCategoryIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: "description is too long" })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: "address is too long" })
  address?: string;

  @IsOptional()
  @IsMongoId({ message: "countryId must be a mongodb id" })
  countryId?: string;

  @IsOptional()
  @IsMongoId({ message: "provinceId must be a mongodb id" })
  provinceId?: string;

  @IsOptional()
  @IsMongoId({ message: "regencyId must be a mongodb id" })
  regencyId?: string;

  @IsOptional()
  @IsMongoId({ message: "districtId must be a mongodb id" })
  districtId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "contactPerson is too long" })
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "contactNumber is too long" })
  contactNumber?: string;

  @IsOptional()
  @IsEmail({}, { message: "email must be valid" })
  @MaxLength(320, { message: "email is too long" })
  email?: string;

  @IsOptional()
  @IsBoolean()
  isSubcon?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "coverageArea is too long" })
  coverageArea?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
