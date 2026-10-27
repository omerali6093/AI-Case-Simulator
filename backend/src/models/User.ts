import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 24 },
    /** Lower-cased username: the unique key, so "Dr_Ann" and "dr_ann" cannot both exist. */
    usernameKey: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    /** Bumped on logout; a session token carries the version it was issued with. */
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import('mongoose').Types.ObjectId };
export const UserModel = model('User', userSchema);
