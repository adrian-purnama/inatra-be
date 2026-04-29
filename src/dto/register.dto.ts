import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";


export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @MinLength(8, { message: "password must be at least 8 characters" })
  @MaxLength(72, { message: "password must be at most 72 characters" })
  @IsNotEmpty()
  password!: string;


  @IsNotEmpty()
  @IsString()
  @MinLength(6, { message: "otp must be at least 6 characters" })
  @MaxLength(6, { message: "otp must be at most 6 characters" })
  otp!: string;
}

