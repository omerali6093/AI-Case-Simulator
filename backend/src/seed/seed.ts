import 'dotenv/config';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { PatientCaseModel } from '../models/PatientCase.js';

export interface SeedCase {
  caseId: string;
  order: number;
  title: string;
  patientName: string;
  age: number;
  look: Record<string, unknown>;
  complaint: string;
  questions: { prompt: string; answer: string }[];
  educationalNote: string;
  steps: { id: string; label: string; detail: string; points: number; feedback: string }[];
}

export function readSeedCases(): SeedCase[] {
  return JSON.parse(readFileSync(new URL('./cases.data.json', import.meta.url), 'utf8')) as SeedCase[];
}

/** Idempotent: upserts the three fictional cases by caseId. */
export async function seedCases(): Promise<number> {
  const cases = readSeedCases();
  for (const c of cases) {
    await PatientCaseModel.updateOne({ caseId: c.caseId }, { $set: { ...c, active: true } }, { upsert: true });
  }
  return cases.length;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(uri);
  console.log(`Seeded ${await seedCases()} fictional cases.`);
  await mongoose.disconnect();
}
