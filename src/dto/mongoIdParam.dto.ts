import { IsMongoId } from "class-validator";

/** Reusable DTO for endpoints that only need a Mongo ObjectId param (`:id`). */
export class MongoIdParamDto {
  @IsMongoId({ message: "id must be a valid Mongo ObjectId" })
  id!: string;
}
