export type ExperimentStatus = 'clean' | 'needs-info' | 'fit-done';

export interface Experiment {
  id: string;
  name: string;
  dataset: string;
  status: ExperimentStatus;
  temperature: string;
  notes: string;
}

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  resolved: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: 'user' | 'agent' | 'system';
  action: string;
  rationale: string;
  references?: string;
}

export const experiments: Experiment[] = Array.from({ length: 20 }).map((_, index) => {
  const statusOptions: ExperimentStatus[] = ['clean', 'needs-info', 'fit-done'];
  const status = statusOptions[index % statusOptions.length];
  return {
    id: `exp-${index + 1}`,
    name: `Experiment ${index + 1}`,
    dataset: `Dataset ${Math.floor(index / 4) + 1}`,
    status,
    temperature: `${22 + (index % 5)}°C`,
    notes:
      status === 'needs-info'
        ? 'Missing buffer condition details'
        : status === 'fit-done'
        ? 'Model fit completed'
        : 'Ready for validation'
  };
});

export const initialQuestions: Record<string, Question[]> = {
  'exp-1': [
    {
      id: 'q-exp1-1',
      prompt: 'Which baseline correction should be applied?',
      options: ['None', 'Subtract blank', 'Normalize to first point'],
      resolved: false
    },
    {
      id: 'q-exp1-2',
      prompt: 'Confirm reagent concentration for run 1.',
      options: ['5 mM', '10 mM', '15 mM'],
      resolved: false
    }
  ],
  'exp-2': [
    {
      id: 'q-exp2-1',
      prompt: 'Is the temperature offset intentional?',
      options: ['Yes, hold at 24°C', 'No, adjust to 22°C'],
      resolved: false
    }
  ],
  'exp-3': [
    {
      id: 'q-exp3-1',
      prompt: 'Pick the preferred smoothing window.',
      options: ['5 s', '10 s', '20 s'],
      resolved: false
    }
  ]
};

export const initialAudit: AuditEntry[] = [
  {
    id: 'audit-1',
    timestamp: '2024-02-12 09:12',
    actor: 'system',
    action: 'Imported dataset bundle',
    rationale: 'Initial project load',
    references: 'sha256:9a7c...'
  },
  {
    id: 'audit-2',
    timestamp: '2024-02-12 09:19',
    actor: 'agent',
    action: 'Suggested mapping for time column',
    rationale: 'Detected monotonic series in column A',
    references: 'mapping: time->colA'
  },
  {
    id: 'audit-3',
    timestamp: '2024-02-12 09:35',
    actor: 'user',
    action: 'Confirmed unit conversion',
    rationale: 'Matches lab notebook',
    references: 'units: ms -> s'
  }
];

export const steps = [
  { id: 'import', label: 'Import & Mapping' },
  { id: 'validation', label: 'Validation' },
  { id: 'questions', label: 'Questions' },
  { id: 'modeling', label: 'Modeling' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'report', label: 'Report' }
] as const;
