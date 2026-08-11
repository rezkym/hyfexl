'use client';

import { useRef, useState } from 'react';

type FinalSubmitGateProps = {
  onSubmit: () => void;
  pending: boolean;
};

export function FinalSubmitGate({ onSubmit, pending }: FinalSubmitGateProps) {
  const [accepted, setAccepted] = useState(false);
  const submitted = useRef(false);

  function submitOnce() {
    if (!accepted || pending || submitted.current) return;
    submitted.current = true;
    onSubmit();
  }

  return (
    <div className="final-gate">
      <label className="checkbox-row">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={submitted.current} />
        <span>Saya memahami bahwa submit dapat menimbulkan proses nyata dan tidak akan dicoba ulang otomatis.</span>
      </label>
      <button className="button button-danger" type="button" onClick={submitOnce} disabled={!accepted || pending || submitted.current}>
        {pending ? 'Mengirim submit…' : 'Kirim sekali'}
      </button>
    </div>
  );
}
