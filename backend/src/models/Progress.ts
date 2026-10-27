import { Schema, model } from 'mongoose';
import { Types } from 'mongoose';
import { ConsultationModel } from './Consultation.js';
import { summarise, type ProgressSummary } from '../lib/scoring.js';

const progressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    totalPoints: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export const ProgressModel = model('Progress', progressSchema);

/**
 * Rebuilds a player's progress from their consultations (the source of truth) and stores it.
 * Safe to call repeatedly; a failed earlier update heals itself on the next call.
 */
export async function recomputeProgress(userId: Types.ObjectId): Promise<ProgressSummary> {
  const [row] = await ConsultationModel.aggregate<{ total: number; count: number }>([
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: '$score' }, count: { $sum: 1 } } },
  ]);
  const summary = summarise(row?.total ?? 0, row?.count ?? 0);
  await ProgressModel.updateOne(
    { userId },
    { $set: { totalPoints: summary.totalPoints, completed: summary.completed, level: summary.level } },
    { upsert: true },
  );
  return summary;
}
