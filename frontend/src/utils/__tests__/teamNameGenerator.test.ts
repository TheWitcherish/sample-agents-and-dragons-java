import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateRandomTeamName } from '../teamNameGenerator';

describe('generateRandomTeamName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a string with two words separated by a space', () => {
    const name = generateRandomTeamName();
    const parts = name.split(' ');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('returns deterministic name when Math.random is mocked', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const name = generateRandomTeamName();
    expect(name).toBe('Mighty Warriors');
  });

  it('picks last elements when Math.random returns 0.999', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const name = generateRandomTeamName();
    expect(name).toBe('Arcane Krakens');
  });

  it('generates different names with different random values', () => {
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(generateRandomTeamName());
    }
    // With 46 adjectives * 40 nouns = 1840 combos, 20 calls should yield multiple unique
    expect(names.size).toBeGreaterThan(1);
  });
});
