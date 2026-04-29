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

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateOpportunityDto {
  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  availableTo?: string[];

  @IsMongoId()
  lineOfBusinessId!: string;

  @IsMongoId()
  marketSegmentId!: string;

  @IsMongoId()
  leadQualificationId!: string;

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
  details?: OpportunityDetailInputDto[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  attachmentAssetIds?: string[];
}
