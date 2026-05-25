import { IsOptional, IsMongoId } from "class-validator";

export class ReviseQuotationDto {
  @IsOptional()
  @IsMongoId()
  approverId?: string;
}
