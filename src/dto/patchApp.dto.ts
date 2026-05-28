import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

class CompanyInformationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "companyName is too long" })
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "companyAddress is too long" })
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "companyPhone is too long" })
  companyPhone?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== "" && v != null)
  @IsEmail({}, { message: "companyEmail must be a valid email" })
  @MaxLength(200, { message: "companyEmail is too long" })
  companyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "companyWebsite is too long" })
  companyWebsite?: string;
}

class QuotationInformationDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: "termsOfPayment is too long" })
  @IsString({ each: true })
  @MaxLength(300, { each: true, message: "termsOfPayment item is too long" })
  termsOfPayment?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: "termsOfDelivery is too long" })
  @IsString({ each: true })
  @MaxLength(300, { each: true, message: "termsOfDelivery item is too long" })
  termsOfDelivery?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: "termsOfWarranty is too long" })
  @IsString({ each: true })
  @MaxLength(300, { each: true, message: "termsOfWarranty item is too long" })
  termsOfWarranty?: string[];
}

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: "personSuffix is too long" })
  @IsString({ each: true })
  @MaxLength(80, { each: true, message: "personSuffix item is too long" })
  personSuffix?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyInformationDto)
  companyInformation?: CompanyInformationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuotationInformationDto)
  quotationInformation?: QuotationInformationDto;
}
