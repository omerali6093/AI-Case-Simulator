import { Schema, model, type InferSchemaType } from 'mongoose';

const consultationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Chosen by the client per attempt; (userId, clientId) is unique so retries are safe. */
    clientId: { type: String, required: true },
    caseId: { type: String, required: true },
    caseTitle: { type: String, required: true },
    patientName: { type: String, required: true },
    stepId: { type: String, required: true },
    stepLabel: { type: String, required: true },
    score: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true },
    feedback: { type: String, required: true },
    educationalNote: { type: String, required: true },
    completedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);
consultationSchema.index({ userId: 1, clientId: 1 }, { unique: true });
consultationSchema.index({ userId: 1, completedAt: -1 });

export type ConsultationDoc = InferSchemaType<typeof consultationSchema>;
export const ConsultationModel = model('Consultation', consultationSchema);
