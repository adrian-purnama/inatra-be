import { IsEmail, IsMongoId, ValidateIf } from "class-validator";

export class SendOtpDto {
  @ValidateIf((o: SendOtpDto) => !o.userId?.trim())
  @IsEmail()
  email = "";

  @ValidateIf((o: SendOtpDto) => !o.email?.trim())
  @IsMongoId()
  userId = "";
}
