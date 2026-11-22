import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SharedMixBanner, ShareLinkButton } from '../ShareMix';

describe('SharedMixBanner', () => {
  it('shows nothing without a shared mix', () => {
    const { container } = render(<SharedMixBanner onApply={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the shared mix and applies it', async () => {
    window.history.replaceState(null, '', '/?mix=SPUS:50,SPTE:40,SPWO:10');
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<SharedMixBanner onApply={onApply} />);

    expect(screen.getByText(/SPUS 50% · SPTE 40% · SPWO 10%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use this mix/i }));

    expect(onApply).toHaveBeenCalledWith([
      { name: 'SPUS', percentage: 50 },
      { name: 'SPTE', percentage: 40 },
      { name: 'SPWO', percentage: 10 },
    ]);
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('button', { name: /use this mix/i })).not.toBeInTheDocument();
  });

  it('can be dismissed without applying', async () => {
    window.history.replaceState(null, '', '/?mix=SPUS:100');
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<SharedMixBanner onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(onApply).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });
});

describe('ShareLinkButton', () => {
  it('copies a link with the mix', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<ShareLinkButton stocks={[{ name: 'SPUS', percentage: 60 }, { name: 'SPTE', percentage: 40 }]} />);

    await user.click(screen.getByRole('button', { name: /copy share link/i }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?mix=SPUS:60,SPTE:40`);
    expect(await screen.findByRole('button', { name: /link copied/i })).toBeInTheDocument();
  });

  it('shows the link when copying is blocked', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<ShareLinkButton stocks={[{ name: 'SPUS', percentage: 100 }]} />);

    await user.click(screen.getByRole('button', { name: /copy share link/i }));
    expect(await screen.findByRole('textbox', { name: /share link/i })).toHaveValue(`${window.location.origin}/?mix=SPUS:100`);
  });

  it('is disabled until the mix adds up to 100%', () => {
    render(<ShareLinkButton stocks={[{ name: 'SPUS', percentage: 60 }]} />);
    expect(screen.getByRole('button', { name: /copy share link/i })).toBeDisabled();
  });
});
