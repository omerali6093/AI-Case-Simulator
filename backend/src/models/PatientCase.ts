import { Schema, model, type InferSchemaType } from 'mongoose';

const stepSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    detail: { type: String, required: true },
    points: { type: Number, required: true, min: 0, max: 100 },
    feedback: { type: String, required: true },
  },
  { _id: false },
);

const questionSchema = new Schema(
  { prompt: { type: String, required: true }, answer: { type: String, required: true } },
  { _id: false },
);

/** What the 3D patient looks like. Purely visual. */
const lookSchema = new Schema(
  {
    skin: String,
    hair: String,
    hairStyle: { type: String, enum: ['short', 'long', 'pony'] },
    top: String,
    bottom: String,
    prop: { type: String, enum: ['tissue', 'head', 'ankle'] },
    beard: Boolean,
    mood: Number,
  },
  { _id: false },
);

/** A FICTIONAL case. Never real patient data. */
const patientCaseSchema = new Schema(
  {
    caseId: { type: String, required: true, unique: true },
    /** Cases are offered to each player in this order, then it repeats. */
    order: { type: Number, required: true, index: true },
    title: { type: String, required: true },
    patientName: { type: String, required: true },
    age: { type: Number, required: true, min: 0, max: 120 },
    look: { type: lookSchema, required: true },
    complaint: { type: String, required: true },
    questions: { type: [questionSchema], validate: (v: unknown[]) => v.length === 4 },
    educationalNote: { type: String, required: true },
    steps: { type: [stepSchema], validate: (v: unknown[]) => v.length >= 2 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type PatientCaseDoc = InferSchemaType<typeof patientCaseSchema>;
export const PatientCaseModel = model('PatientCase', patientCaseSchema);
