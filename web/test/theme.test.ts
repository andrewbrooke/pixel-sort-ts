import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getInitialTheme, applyTheme } from '../app/utils/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getInitialTheme', () => {
  it('returns dark by default', () => {
    expect(getInitialTheme()).toBe('dark');
  });

  it('returns stored theme from localStorage', () => {
    localStorage.setItem('theme', 'light');
    expect(getInitialTheme()).toBe('light');

    localStorage.setItem('theme', 'dark');
    expect(getInitialTheme()).toBe('dark');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem('theme', 'blue');
    expect(getInitialTheme()).toBe('dark');
  });

  it('falls back to system preference when no stored value', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    expect(getInitialTheme()).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets data-theme on documentElement', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persists to localStorage', () => {
    applyTheme('light');
    expect(localStorage.getItem('theme')).toBe('light');

    applyTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
