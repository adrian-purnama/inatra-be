import {
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

class OpportunityDetailInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsMongoId()
  productId?: string | null;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;
}

export class PatchOpportunityDto {
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
  leadQualificationId?: string;

  @IsOptional()
  @IsMongoId()
  customerId?: string | null;

  @IsOptional()
  @IsMongoId()
  endUserId?: string | null;

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
  provinceId?: string | null;

  @IsOptional()
  @IsMongoId()
  regencyId?: string | null;

  @IsOptional()
  @IsMongoId()
  districtId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  propability?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "estimateCloseDate must be YYYY-MM",
  })
  estimateCloseDate?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "actualCloseDate must be YYYY-MM",
  })
  actualCloseDate?: string | null;

  @IsOptional()
  @IsArray()
  details?: OpportunityDetailInputDto[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  attachmentAssetIds?: string[];
}
