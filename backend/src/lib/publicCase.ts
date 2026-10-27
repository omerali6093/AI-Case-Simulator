import type { PatientCaseDoc } from '../models/PatientCase.js';

/** The shape the browser game needs to run an interview. No scoring data. */
export function toPublicCase(c: PatientCaseDoc) {
  return {
    id: c.caseId,
    title: c.title,
    name: c.patientName,
    age: c.age,
    look: c.look,
    complaint: c.complaint,
    qs: c.questions.map((q) => ({ prompt: q.prompt, answer: q.answer })),
    steps: c.steps.map((s) => ({ id: s.id, label: s.label, detail: s.detail })),
  };
}
