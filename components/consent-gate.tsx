'use client';

import { useState } from 'react';

type ConsentGateProps = {
  email: string;
  onContinue: () => void;
  pending: boolean;
};

export function ConsentGate({ email, onContinue, pending }: ConsentGateProps) {
  const [accepted, setAccepted] = useState(false);

  return (
    <section className="flow-section" aria-labelledby="consent-title">
      <p className="section-kicker">Tahap 4 dari 6</p>
      <h2 id="consent-title">Persetujuan Anda diperlukan</h2>
      <p>
        Layanan resmi akan mencatat persetujuan TNC dan opt-in email untuk <strong>{email}</strong>.
        Lanjutkan hanya bila Anda memahami dan menyetujuinya.
      </p>
      <label className="checkbox-row">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
        <span>Saya telah membaca informasi ini dan setuju untuk mencatat persetujuan.</span>
      </label>
      <button className="button button-primary" type="button" onClick={onContinue} disabled={!accepted || pending}>
        {pending ? 'Mencatat persetujuan…' : 'Catat persetujuan'}
      </button>
    </section>
  );
}
