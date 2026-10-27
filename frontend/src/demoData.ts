// Offline demo case data – mirrors backend/src/seed/cases.data.json
// Keep in sync with: cd backend && npm run sync:demo

export interface DemoCase {
  caseId: string
  order: number
  title: string
  patientName: string
  age: number
  look: {
    skin: string
    hair: string
    hairStyle: string
    top: string
    bottom: string
    prop?: string
    beard?: boolean
    mood?: number
  }
  complaint: string
  questions: { prompt: string; answer: string }[]
  steps: { id: string; label: string; detail: string; points: number; feedback: string }[]
  educationalNote: string
}

export const DEMO_CASES: DemoCase[] = [
  {
    caseId: 'case-cold',
    order: 0,
    title: 'Stuffy nose and sore throat',
    patientName: 'Sara Khan',
    age: 24,
    look: { skin: '#e7b999', hair: '#2a1d18', hairStyle: 'long', top: '#e08a6e', bottom: '#3a4a63', prop: 'tissue', mood: 0.5 },
    complaint: "I've had a blocked nose and a sore throat since the day before yesterday.",
    questions: [
      { prompt: 'When did it start, and is it getting better or worse?', answer: "Two days ago. It's about the same, maybe a little better today." },
      { prompt: 'Any fever, trouble breathing or chest pain?', answer: 'No fever and no trouble breathing. Just a mild cough.' },
      { prompt: 'How are you eating, drinking and sleeping?', answer: "My appetite is fine, but I'm sleeping badly because my nose is blocked." },
      { prompt: 'Do you have any long-term conditions or take regular medicines?', answer: "No, I'm healthy and don't take anything regularly." },
    ],
    steps: [
      { id: 'rest-fluids', label: 'Self-care: rest, fluids and symptom relief', detail: 'Advise rest, plenty of fluids and simple comfort measures, and explain when to come back.', points: 100, feedback: 'Well chosen. The history points to a mild, short-lived illness with no warning signs, so supportive care with clear advice on when to return fits.' },
      { id: 'antibiotics', label: 'Prescribe antibiotics', detail: 'Start an antibiotic course today.', points: 30, feedback: "Antibiotics don't help viral-type illnesses and carry side effects and resistance risks. Nothing in this history suggested a bacterial cause." },
      { id: 'emergency', label: 'Send to the emergency department', detail: 'Arrange urgent hospital assessment.', points: 15, feedback: "That is over-escalation. There was no fever, breathing difficulty or chest pain, so urgent care wasn't indicated." },
      { id: 'reassure-only', label: 'Reassure and give no further advice', detail: "Tell her it's nothing to worry about.", points: 55, feedback: 'Reassurance is reasonable, but you missed the chance to explain self-care and when she should seek a review.' },
    ],
    educationalNote: 'Most mild cold-like illnesses settle on their own. Good consultations pair reassurance with practical self-care and clear "come back if" advice.',
  },
  {
    caseId: 'case-headache',
    order: 1,
    title: 'Afternoon forehead headaches',
    patientName: 'Daniel Okafor',
    age: 41,
    look: { skin: '#8d5a3b', hair: '#15110f', hairStyle: 'short', top: '#5b8fb9', bottom: '#2f3b4f', prop: 'head', beard: true, mood: 0.7 },
    complaint: "I've had a dull, tight headache across my forehead most afternoons this week.",
    questions: [
      { prompt: 'When do the headaches happen and how long do they last?', answer: 'Mostly mid-afternoon, lasting a few hours. It started Monday and feels like a tight band around my forehead.' },
      { prompt: 'Any vision changes, weakness, stiff neck or a sudden severe headache?', answer: "No, nothing like that. It's dull, never sudden, and I haven't felt weak or dizzy." },
      { prompt: 'Could screens, sleep, caffeine or stress be triggers?', answer: "There's a big deadline at work, long hours at a screen, about four coffees a day, and roughly five hours of sleep." },
      { prompt: 'What have you tried, and has it helped?', answer: 'A short walk helps a little. I took a tablet from the pharmacy twice this week and it eased things.' },
    ],
    steps: [
      { id: 'lifestyle-followup', label: 'Review lifestyle triggers and arrange a follow-up', detail: 'Discuss screen breaks, hydration, sleep and caffeine, explain warning signs, and book a review if it persists.', points: 100, feedback: 'Well chosen. No warning signs were reported and there are clear modifiable triggers, so addressing them with a safety-net and follow-up is appropriate.' },
      { id: 'imaging', label: 'Order urgent brain imaging', detail: 'Request a scan straight away.', points: 35, feedback: "No red-flag features were reported, so urgent imaging isn't justified and would add cost and worry." },
      { id: 'daily-painkillers', label: 'Advise taking painkillers every day', detail: 'Suggest a daily tablet until the headaches stop.', points: 25, feedback: 'Taking painkillers on most days can itself lead to ongoing headaches. Addressing triggers comes first.' },
      { id: 'reassure-only', label: "Tell him it's nothing to worry about", detail: 'Offer reassurance only.', points: 40, feedback: 'Reassurance helps, but a good consultation also explains warning signs and what to do if the headaches continue.' },
    ],
    educationalNote: 'Tension-type headaches are common and often linked to stress, posture, screen time, sleep and caffeine. Knowing the warning signs that need prompt review is the key safety step.',
  },
  {
    caseId: 'case-ankle',
    order: 2,
    title: 'Twisted ankle after football',
    patientName: 'Priya Nair',
    age: 19,
    look: { skin: '#d9a17d', hair: '#1f1714', hairStyle: 'pony', top: '#4fae8a', bottom: '#2c3a52', prop: 'ankle', mood: 0.35 },
    complaint: 'I rolled my ankle playing football yesterday and now it is swollen and sore.',
    questions: [
      { prompt: 'How exactly did you hurt it, and can you put weight on it?', answer: 'I landed awkwardly and rolled it outwards. I can take a few steps, but it hurts.' },
      { prompt: 'Any numbness, tingling or visible deformity?', answer: "No numbness, and it doesn't look misshapen. It's just puffy around the outer ankle." },
      { prompt: 'How have the swelling and bruising changed since yesterday?', answer: 'The swelling went up a bit overnight and there is some light bruising now.' },
      { prompt: 'Any earlier injuries to this ankle or other health conditions?', answer: 'I sprained the same ankle two years ago. No other health problems.' },
    ],
    steps: [
      { id: 'rice-review', label: 'Rest, ice, compression and elevation with a review plan', detail: 'Advise protected rest, a cold pack, a light wrap and elevation, with gentle movement as pain allows, and review if she cannot bear weight or is not improving.', points: 100, feedback: 'Well chosen. She can bear some weight with no worrying features, so simple self-care with a clear review plan fits a likely mild sprain.' },
      { id: 'keep-playing', label: 'Return to football straight away', detail: 'Tell her to play through it.', points: 15, feedback: 'Playing on a freshly injured ankle risks further damage and a longer recovery.' },
      { id: 'surgery', label: 'Refer for a surgical opinion', detail: 'Arrange an orthopaedic surgery appointment.', points: 25, feedback: 'Surgery is not a first step for a likely mild sprain with no deformity or numbness.' },
      { id: 'long-immobilise', label: 'Immobilise fully for several weeks', detail: 'Use a rigid cast and no movement.', points: 50, feedback: 'Long complete immobilisation can slow recovery from a mild sprain. Early gentle movement is generally encouraged.' },
    ],
    educationalNote: 'Many ankle sprains recover with protected rest and gradual movement. Being unable to bear weight, numbness or deformity are signs for faster assessment.',
  },
]
