type ResultPanelProps = {
  result: { statusCode?: unknown; resultCode?: unknown; message?: unknown };
  onRestart: () => void;
};

export function ResultPanel({ result, onRestart }: ResultPanelProps) {
  const message = typeof result.message === 'string' && result.message ? result.message : 'Respons final telah diterima dari layanan.';

  return (
    <section className="flow-section result-panel" aria-labelledby="result-title">
      <p className="section-kicker">Proses selesai</p>
      <h2 id="result-title">Respons layanan diterima</h2>
      <p>{message}</p>
      <dl className="result-details">
        <div><dt>Status HTTP</dt><dd>{String(result.statusCode ?? 'tidak tersedia')}</dd></div>
        <div><dt>Kode hasil</dt><dd>{String(result.resultCode ?? 'tidak tersedia')}</dd></div>
      </dl>
      <p className="notice notice-neutral">Sesi browser ini telah ditutup. Simpan detail dari layanan resmi bila diperlukan.</p>
      <button className="button button-secondary" type="button" onClick={onRestart}>Mulai sesi baru</button>
    </section>
  );
}
