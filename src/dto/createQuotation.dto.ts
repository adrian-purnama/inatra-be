import {
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { QUOTATION_STATUS_VALUES } from "../models/quotation/quotationHeader.model.js";

class QuotationDetailInputDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lineNotes?: string;
}

export class CreateQuotationDto {
  @IsOptional()
  @IsMongoId()
  opportunityId?: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  availableTo?: string[];

  @IsOptional()
  @IsMongoId()
  lineOfBusinessId?: string;

  @IsOptional()
  @IsMongoId()
  marketSegmentId?: string;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsMongoId()
  endUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactSuffix?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactDetails?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsMongoId()
  provinceId?: string;

  @IsOptional()
  @IsMongoId()
  regencyId?: string;

  @IsOptional()
  @IsMongoId()
  districtId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  propability?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "estimateCloseDate must be YYYY-MM",
  })
  estimateCloseDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "actualCloseDate must be YYYY-MM",
  })
  actualCloseDate?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  attachmentAssetIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  quotationNo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  revisionNo?: number;

  @IsOptional()
  @IsIn(QUOTATION_STATUS_VALUES as unknown as string[])
  quotationStatus?: string;

  @IsOptional()
  @IsMongoId()
  approverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountTotal?: number;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  termsAndConditions?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  termsOfPaymentSelected?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  termsOfDeliverySelected?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  termsOfWarrantySelected?: string[];

  @IsOptional()
  @IsArray()
  details?: QuotationDetailInputDto[];
}
