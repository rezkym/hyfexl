'use client';

import { FormEvent, useMemo, useState } from 'react';
import { ConsentGate } from './consent-gate';
import { FinalSubmitGate } from './final-submit-gate';
import { FormField, TextareaField } from './form-field';
import { ResultPanel } from './result-panel';
import { StepIndicator } from './step-indicator';
import { postFlow } from '@/lib/client-api';
import { formatZodIssues, identitySchema, numberSearchSchema, otpSchema } from '@/lib/validation';

type Stage = 'start' | 'numbers' | 'details' | 'consent' | 'otp' | 'review' | 'result';
type Candidate = { id: string; label: string };
type Profile = { fullName: string; whatsapp: string; email: string; eid: string };
type FinalResult = { statusCode?: unknown; resultCode?: unknown; message?: unknown };

const emptyProfile: Profile = { fullName: '', whatsapp: '', email: '', eid: '' };

function maskTail(value: string, keep = 4): string {
  return `${'*'.repeat(Math.max(0, value.length - keep))}${value.slice(-keep)}`;
}

function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!domain) return '***';
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function stageNumber(stage: Stage): number {
  return { start: 1, numbers: 2, details: 3, consent: 4, otp: 5, review: 6, result: 6 }[stage];
}

export function HyfeFlow() {
  const [stage, setStage] = useState<Stage>('start');
  const [prefix, setPrefix] = useState('6281');
  const [pattern, setPattern] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [otp, setOtp] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalResult | null>(null);

  const selectedLabel = useMemo(() => selected?.label ?? 'Belum dipilih', [selected]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Terjadi masalah tak terduga.');
    } finally {
      setPending(false);
    }
  }

  function startSession() {
    void run(async () => {
      await postFlow<Record<string, never>>('/api/flow/bootstrap');
      setStage('numbers');
    });
  }

  function searchNumbers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = numberSearchSchema.safeParse({ prefix, pattern, pageSize: 40 });
    if (!parsed.success) {
      setError(formatZodIssues(parsed.error.issues));
      return;
    }
    void run(async () => {
      const response = await postFlow<{ candidates: Candidate[]; noMatch: boolean; pageNo: number }>('/api/flow/numbers', parsed.data);
      setCandidates(response.candidates);
      setSelected(null);
      if (response.noMatch) setError('Belum ada nomor yang cocok. Ubah pola atau coba pencarian acak lagi.');
    });
  }

  function confirmDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = identitySchema.safeParse(profile);
    if (!parsed.success) {
      setError(formatZodIssues(parsed.error.issues));
      return;
    }
    setProfile(parsed.data);
    setError(null);
    setStage('consent');
  }

  function recordConsent() {
    void run(async () => {
      await postFlow('/api/flow/consent', { email: profile.email, confirmed: true });
      setStage('otp');
    });
  }

  function requestOtp() {
    void run(async () => {
      await postFlow('/api/flow/otp', { email: profile.email, fullName: profile.fullName });
      setOtpSent(true);
    });
  }

  function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = otpSchema.safeParse({ otp, captcha });
    if (!parsed.success) {
      setError(formatZodIssues(parsed.error.issues));
      return;
    }
    setOtp(parsed.data.otp);
    setCaptcha(parsed.data.captcha);
    setError(null);
    setStage('review');
  }

  function submitFinal() {
    if (!selected) {
      setError('Pilih nomor terlebih dahulu.');
      return;
    }
    void run(async () => {
      const response = await postFlow<FinalResult>('/api/flow/submit', {
        ...profile,
        otp,
        captcha,
        selectionId: selected.id,
        confirmed: true,
      });
      setResult(response);
      setCaptcha('');
      setOtp('');
      setStage('result');
    });
  }

  function restart() {
    setStage('start');
    setCandidates([]);
    setSelected(null);
    setProfile(emptyProfile);
    setOtp('');
    setCaptcha('');
    setOtpSent(false);
    setError(null);
    setResult(null);
  }

  return (
    <main className="app-shell">
      <section className="app-card" aria-labelledby="flow-title">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true">H</div>
          <div>
            <p className="eyebrow">Pendaftaran mandiri</p>
            <h1 id="flow-title">HYFE eSIM Trial</h1>
            <p className="subtitle">Alur terpandu dengan kendali penuh di tangan Anda.</p>
          </div>
        </header>

        <StepIndicator current={stageNumber(stage)} />
        {error && <div className="notice notice-error" role="alert">{error}</div>}

        {stage === 'start' && (
          <section className="flow-section" aria-labelledby="start-title">
            <p className="section-kicker">Tahap 1 dari 6</p>
            <h2 id="start-title">Mulai sesi aman</h2>
            <p>
              Aplikasi akan membuat sesi sementara dengan layanan resmi. Data pribadi, OTP, dan CAPTCHA tidak disimpan setelah sesi selesai.
            </p>
            <div className="notice notice-neutral">
              Gunakan hanya data Anda sendiri dan proses yang memang Anda berwenang lakukan.
            </div>
            <button className="button button-primary" type="button" onClick={startSession} disabled={pending}>
              {pending ? 'Membuat sesi…' : 'Mulai sesi aman'}
            </button>
          </section>
        )}

        {stage === 'numbers' && (
          <section className="flow-section" aria-labelledby="numbers-title">
            <p className="section-kicker">Tahap 2 dari 6</p>
            <h2 id="numbers-title">Pilih nomor HYFE</h2>
            <p>Cari nomor dengan pola favorit hingga lima digit, atau kosongkan pola untuk pencarian inventori acak.</p>
            <form className="form-grid" onSubmit={searchNumbers}>
              <FormField id="prefix" label="Prefix nomor" inputMode="numeric" value={prefix} onChange={(event) => setPrefix(event.target.value)} required />
              <FormField id="pattern" label="Pola favorit (opsional)" inputMode="numeric" maxLength={5} value={pattern} onChange={(event) => setPattern(event.target.value)} hint="Contoh: 12345" />
              <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Mencari…' : 'Cari nomor'}</button>
            </form>
            {candidates.length > 0 && (
              <div className="candidate-list" role="radiogroup" aria-label="Nomor tersedia">
                {candidates.map((candidate) => (
                  <label key={candidate.id} className={`candidate ${selected?.id === candidate.id ? 'candidate-selected' : ''}`}>
                    <input type="radio" name="number" checked={selected?.id === candidate.id} onChange={() => setSelected(candidate)} />
                    <span>{candidate.label}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="action-row">
              <button className="button button-ghost" type="button" onClick={restart} disabled={pending}>Batalkan</button>
              <button className="button button-primary" type="button" onClick={() => setStage('details')} disabled={!selected || pending}>Gunakan nomor ini</button>
            </div>
          </section>
        )}

        {stage === 'details' && (
          <section className="flow-section" aria-labelledby="details-title">
            <p className="section-kicker">Tahap 3 dari 6</p>
            <h2 id="details-title">Data pelanggan</h2>
            <p>Nomor pilihan: <strong>{selectedLabel}</strong></p>
            <form className="form-grid" onSubmit={confirmDetails}>
              <FormField id="full-name" label="Nama lengkap" autoComplete="name" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required />
              <FormField id="whatsapp" label="WhatsApp" hint="Tanpa 0 atau +62, contoh 81212345678" inputMode="numeric" autoComplete="tel-national" value={profile.whatsapp} onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })} required />
              <FormField id="email" label="Email" type="email" autoComplete="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required />
              <FormField id="eid" label="EID perangkat" hint="Tepat 32 digit angka" inputMode="numeric" autoComplete="off" maxLength={32} value={profile.eid} onChange={(event) => setProfile({ ...profile, eid: event.target.value })} required />
              <div className="action-row">
                <button className="button button-ghost" type="button" onClick={() => setStage('numbers')}>Kembali</button>
                <button className="button button-primary" type="submit">Lanjutkan</button>
              </div>
            </form>
          </section>
        )}

        {stage === 'consent' && <ConsentGate email={profile.email} onContinue={recordConsent} pending={pending} />}

        {stage === 'otp' && (
          <section className="flow-section" aria-labelledby="otp-title">
            <p className="section-kicker">Tahap 5 dari 6</p>
            <h2 id="otp-title">Verifikasi email dan CAPTCHA</h2>
            {!otpSent ? (
              <>
                <p>OTP akan dikirim ke <strong>{maskEmail(profile.email)}</strong> setelah Anda menekan tombol berikut.</p>
                <button className="button button-primary" type="button" onClick={requestOtp} disabled={pending}>{pending ? 'Mengirim OTP…' : 'Kirim OTP ke email'}</button>
              </>
            ) : (
              <form className="form-grid" onSubmit={verifyOtp}>
                <div className="notice notice-neutral">OTP telah diminta. Periksa inbox dan folder spam email Anda.</div>
                <FormField id="otp" label="OTP email" inputMode="text" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value)} required />
                <TextareaField id="captcha" label="Respons CAPTCHA resmi (manual)" rows={4} autoComplete="off" value={captcha} onChange={(event) => setCaptcha(event.target.value)} hint="Selesaikan CAPTCHA di layanan resmi secara manual. Aplikasi ini tidak dapat memecahkan atau melewati CAPTCHA." required />
                <a className="official-link" href="https://prioritas.xl.co.id/hyfe-apply/esim-trial" target="_blank" rel="noreferrer">Buka halaman resmi HYFE ↗</a>
                <div className="action-row">
                  <button className="button button-ghost" type="button" onClick={() => setStage('consent')}>Kembali</button>
                  <button className="button button-primary" type="submit">Tinjau submit</button>
                </div>
              </form>
            )}
          </section>
        )}

        {stage === 'review' && (
          <section className="flow-section" aria-labelledby="review-title">
            <p className="section-kicker">Tahap 6 dari 6</p>
            <h2 id="review-title">Tinjau sebelum submit</h2>
            <p>Pastikan ringkasan berikut benar sebelum mengirim satu kali.</p>
            <dl className="review-list">
              <div><dt>Nomor</dt><dd>{selectedLabel}</dd></div>
              <div><dt>Nama</dt><dd>{profile.fullName}</dd></div>
              <div><dt>WhatsApp</dt><dd>+62{maskTail(profile.whatsapp)}</dd></div>
              <div><dt>Email</dt><dd>{maskEmail(profile.email)}</dd></div>
              <div><dt>EID</dt><dd>{maskTail(profile.eid, 6)}</dd></div>
            </dl>
            <div className="notice notice-warning">Submit final dapat memiliki efek nyata. Bila respons time out, aplikasi tidak akan mengirim ulang otomatis.</div>
            <FinalSubmitGate onSubmit={submitFinal} pending={pending} />
          </section>
        )}

        {stage === 'result' && result && <ResultPanel result={result} onRestart={restart} />}
      </section>
    </main>
  );
}
