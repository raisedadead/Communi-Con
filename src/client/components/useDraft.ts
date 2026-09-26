import { type ChangeEvent, useState } from 'react';

export interface DraftField {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function useDraft(saved: string): DraftField {
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(saved);
  if (saved !== base) {
    setBase(saved);
    if (!editing) setDraft(null);
  }
  return {
    value: draft ?? saved,
    onChange: event => setDraft(event.target.value),
    onFocus: () => setEditing(true),
    onBlur: () => setEditing(false),
  };
}
