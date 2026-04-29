import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  ValidateIf,
} from "class-validator";

export class LinkOpportunityAttachmentDto {
  @IsMongoId()
  assetFileId!: string;
}

export class ShareOpportunityAttachmentDto {
  @IsMongoId()
  assetFileId!: string;

  @IsOptional()
  @IsBoolean()
  shareWithAllAvailable?: boolean;

  @ValidateIf((o) => !o.shareWithAllAvailable)
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  userIds!: string[];
}
