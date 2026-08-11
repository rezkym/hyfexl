import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConsentGate } from '@/components/consent-gate';
import { FinalSubmitGate } from '@/components/final-submit-gate';
import { HyfeFlow } from '@/components/hyfe-flow';

describe('HYFE flow UI', () => {
  it('shows a clear entry point for a new secure session', () => {
    render(<HyfeFlow />);

    expect(screen.getByRole('heading', { name: /HYFE eSIM Trial/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Mulai sesi aman/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Kirim sekali/i })).not.toBeInTheDocument();
  });

  it('does not allow consent to proceed before its acknowledgement is checked', () => {
    const onContinue = vi.fn();
    render(<ConsentGate email="rezky@example.com" onContinue={onContinue} pending={false} />);

    const button = screen.getByRole('button', { name: /Catat persetujuan/i });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('allows a final submission action only once after explicit acknowledgement', () => {
    const onSubmit = vi.fn();
    const view = render(<FinalSubmitGate onSubmit={onSubmit} pending={false} />);
    const finalGate = within(view.container);

    const button = finalGate.getByRole('button', { name: /Kirim sekali/i });
    expect(button).toBeDisabled();
    fireEvent.click(finalGate.getByRole('checkbox'));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
