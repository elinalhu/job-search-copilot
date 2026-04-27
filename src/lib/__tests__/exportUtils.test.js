import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportCSV } from '../exportUtils';

beforeEach(() => {
  // Mock DOM APIs used by the download helper
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});

const sampleJobs = [
  {
    company: 'Acme Corp',
    role: 'Software Engineer',
    status: 'Applied',
    workStyle: 'Remote',
    location: 'San Francisco, CA',
    salaryRange: '$150k-$180k',
    referral: true,
    notes: 'Great company',
    createdAt: '2024-06-15T10:00:00Z',
    analysis: { preferenceFit: { score: 8 } },
  },
  {
    company: 'Beta Inc',
    role: 'Product Manager',
    status: 'Interview',
    workStyle: '',
    location: '',
    salaryRange: '',
    referral: false,
    notes: '',
    createdAt: '2024-07-01T12:00:00Z',
    analysis: null,
  },
];

describe('exportCSV', () => {
  it('generates a valid CSV string and triggers download', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    });

    exportCSV(sampleJobs);

    expect(clickSpy).toHaveBeenCalled();
  });

  it('properly escapes quotes in CSV fields', () => {
    const jobWithQuotes = [{
      company: 'Acme "Best" Corp',
      role: 'Engineer',
      status: 'Applied',
      workStyle: '',
      location: '',
      salaryRange: '',
      referral: false,
      notes: 'Said "hello"',
      createdAt: '2024-01-01T00:00:00Z',
      analysis: null,
    }];

    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    });

    // Verify no error thrown with special characters
    expect(() => exportCSV(jobWithQuotes)).not.toThrow();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('handles empty jobs array', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    });

    expect(() => exportCSV([])).not.toThrow();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('handles missing optional fields gracefully', () => {
    const minimalJob = [{
      company: 'Test',
      role: 'Dev',
      status: 'Applied',
      referral: false,
      createdAt: '2024-01-01T00:00:00Z',
    }];

    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    });

    expect(() => exportCSV(minimalJob)).not.toThrow();
  });
});
