import { IsOptional, IsString, MaxLength } from "class-validator";

export class ApproveQuotationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
