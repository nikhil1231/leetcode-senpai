import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from './Review';
import type { Attempt } from './types';

const attempt: Attempt = {
  id: 'a', mode: 'reading', category: 'repair', status: 'submitted', started_at: 1, explanation: 'Root cause', hints_used: 0,
  revision: 1, refs: [], hints: [],
  result: { score: 90, process: 80, process_note: 'A trace', by: 'examiner', summary: 'Fixed `>=`.',
    findings: [{ id: 'f1', met: true, note: 'Correct.' }], misconceptions: [], strengths: ['Used evidence.'], improve: [],
    takeaways: [{ principle: 'State the invariant', evidence: 'Traced the limit.', next_time: 'Check below, at and above.' }] },
  review: { expected_behaviour: 'Keep capacity.', execution_path: '1. Add\n2. Trim', root_cause: 'Comparison.', interactions: '',
    model_answer: 'A reference answer.', fix_summary: '', findings: [{ id: 'f1', text: 'The comparison.', key: true, locations: [{ path: 'Store.java', start: 2, end: 2 }] }] },
};

describe('coding review', () => {
  it('leads with takeaways, collapses evidence, and preserves source navigation', () => {
    const onOpen = vi.fn();
    const { container } = render(<ReviewPanel attempt={attempt} category="repair" onAttempt={vi.fn()} onNext={vi.fn()} onOpen={onOpen} />);
    expect(screen.getByRole('heading', { name: 'Take into your next exercise' })).toBeVisible();
    expect(container.querySelector('code')?.textContent).toBe('>=');
    const summary = screen.getByText(/Marking breakdown/);
    expect(summary.closest('details')?.open).toBe(false);
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole('button', { name: 'Store.java:2' }));
    expect(onOpen).toHaveBeenCalledWith('Store.java', 2, 2);
  });
  it('keeps older feedback readable without inventing takeaways', () => {
    const old = { ...attempt, result: { ...attempt.result!, takeaways: undefined, improve: ['Trace the caller.'] } };
    render(<ReviewPanel attempt={old} category="repair" onAttempt={vi.fn()} onNext={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: 'Take into your next exercise' })).toBeNull();
    fireEvent.click(screen.getByText('Feedback details'));
    expect(screen.getByText('Trace the caller.')).toBeVisible();
  });
  it('escapes feedback HTML while formatting inline code', () => {
    const unsafe = { ...attempt, result: { ...attempt.result!, summary: '<img src=x onerror=alert(1)> `safe`' } };
    const { container } = render(<ReviewPanel attempt={unsafe} category="repair" onAttempt={vi.fn()} onNext={vi.fn()} onOpen={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe('safe');
  });
  it('opens self-marking', () => {
    const { container } = render(<ReviewPanel attempt={{ ...attempt, result: null }} category="repair" onAttempt={vi.fn()} onNext={vi.fn()} onOpen={vi.fn()} />);
    expect(container.querySelector('details[open]')).not.toBeNull();
    expect(screen.getByRole('checkbox')).toBeVisible();
  });
});
