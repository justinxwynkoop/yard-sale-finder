import {
  getParentGroup,
  addCategory,
  removeCategory,
  toggleCategory,
  getCategoryLabel,
  CATEGORY_GROUPS,
} from '../categories';
import { ItemCategory } from '../../types';

// Real fixtures pulled straight from CATEGORY_GROUPS so the tests track the
// actual data. `furniture` is a parent with subcategories; `toys` is a bare
// top-level category with none.
const PARENT: ItemCategory = 'furniture';
const SUB_A: ItemCategory = 'furniture_bedroom';
const SUB_B: ItemCategory = 'furniture_office';
const TOP_LEVEL: ItemCategory = 'toys';

describe('getParentGroup', () => {
  it('returns the parent group for a subcategory', () => {
    const parent = getParentGroup(SUB_A);
    expect(parent).not.toBeNull();
    expect(parent?.value).toBe(PARENT);
  });

  it('returns null for a top-level parent value', () => {
    expect(getParentGroup(PARENT)).toBeNull();
  });

  it('returns null for a top-level category with no subcategories', () => {
    expect(getParentGroup(TOP_LEVEL)).toBeNull();
  });
});

describe('addCategory', () => {
  it('adds the parent automatically when adding a subcategory', () => {
    const out = addCategory([], SUB_A);
    expect(out).toContain(SUB_A);
    expect(out).toContain(PARENT);
  });

  it('adds only the parent when adding a parent value', () => {
    const out = addCategory([], PARENT);
    expect(out).toEqual([PARENT]);
  });

  it('adds a bare top-level category by itself', () => {
    expect(addCategory([], TOP_LEVEL)).toEqual([TOP_LEVEL]);
  });

  it('is idempotent — re-adding an existing value produces no duplicates', () => {
    const once = addCategory([], SUB_A);
    const twice = addCategory(once, SUB_A);
    expect(twice).toEqual(once);
    expect(twice.filter((c) => c === SUB_A)).toHaveLength(1);
    expect(twice.filter((c) => c === PARENT)).toHaveLength(1);
  });

  it('does not duplicate a parent that is already selected', () => {
    const out = addCategory([PARENT], SUB_A);
    expect(out.filter((c) => c === PARENT)).toHaveLength(1);
    expect(out).toContain(SUB_A);
  });

  it('preserves previously selected unrelated categories', () => {
    const out = addCategory([TOP_LEVEL], SUB_A);
    expect(out).toContain(TOP_LEVEL);
    expect(out).toContain(SUB_A);
    expect(out).toContain(PARENT);
  });

  it('does not mutate the input array', () => {
    const input: ItemCategory[] = [];
    addCategory(input, SUB_A);
    expect(input).toEqual([]);
  });
});

describe('removeCategory', () => {
  it('removing a parent strips the parent and ALL its subcategories', () => {
    const selected: ItemCategory[] = [PARENT, SUB_A, SUB_B, TOP_LEVEL];
    const out = removeCategory(selected, PARENT);
    expect(out).not.toContain(PARENT);
    expect(out).not.toContain(SUB_A);
    expect(out).not.toContain(SUB_B);
    // Unrelated category survives.
    expect(out).toEqual([TOP_LEVEL]);
  });

  it('removing a subcategory removes only that sub and leaves the parent', () => {
    const selected: ItemCategory[] = [PARENT, SUB_A, SUB_B];
    const out = removeCategory(selected, SUB_A);
    expect(out).not.toContain(SUB_A);
    expect(out).toContain(PARENT);
    expect(out).toContain(SUB_B);
  });

  it('removing an absent value is a no-op', () => {
    const selected: ItemCategory[] = [TOP_LEVEL];
    expect(removeCategory(selected, SUB_A)).toEqual([TOP_LEVEL]);
  });

  it('removing from an empty selection returns an empty array', () => {
    expect(removeCategory([], PARENT)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input: ItemCategory[] = [PARENT, SUB_A];
    removeCategory(input, PARENT);
    expect(input).toEqual([PARENT, SUB_A]);
  });
});

describe('toggleCategory', () => {
  it('toggling an unselected subcategory adds it along with its parent', () => {
    const out = toggleCategory([], SUB_A);
    expect(out).toContain(SUB_A);
    expect(out).toContain(PARENT);
  });

  it('toggling an unselected parent adds only the parent', () => {
    expect(toggleCategory([], PARENT)).toEqual([PARENT]);
  });

  it('toggling a selected subcategory removes only that sub (parent stays)', () => {
    const selected: ItemCategory[] = [PARENT, SUB_A];
    const out = toggleCategory(selected, SUB_A);
    expect(out).not.toContain(SUB_A);
    expect(out).toContain(PARENT);
  });

  it('toggling a selected parent removes the parent and all its subs', () => {
    const selected: ItemCategory[] = [PARENT, SUB_A, SUB_B];
    expect(toggleCategory(selected, PARENT)).toEqual([]);
  });

  it('round-trips: toggle on then off returns to the original selection', () => {
    const start: ItemCategory[] = [TOP_LEVEL];
    const added = toggleCategory(start, PARENT);
    const removed = toggleCategory(added, PARENT);
    expect(removed.sort()).toEqual(start.sort());
  });
});

describe('getCategoryLabel', () => {
  it('returns the group label for a parent value', () => {
    expect(getCategoryLabel(PARENT)).toBe('Furniture');
  });

  it('returns the subcategory label for a sub value', () => {
    expect(getCategoryLabel(SUB_A)).toBe('Bedroom');
  });

  it('returns the bare top-level label', () => {
    expect(getCategoryLabel(TOP_LEVEL)).toBe('Toys');
  });

  it('falls back to a humanized form for an unknown value', () => {
    expect(getCategoryLabel('some_unknown_value' as ItemCategory)).toBe(
      'Some unknown value',
    );
  });
});

describe('CATEGORY_GROUPS data integrity', () => {
  it('the chosen parent fixture really has the chosen subcategories', () => {
    const group = CATEGORY_GROUPS.find((g) => g.value === PARENT);
    const subValues = group?.subcategories?.map((s) => s.value) ?? [];
    expect(subValues).toContain(SUB_A);
    expect(subValues).toContain(SUB_B);
  });

  it('the chosen top-level fixture has no subcategories', () => {
    const group = CATEGORY_GROUPS.find((g) => g.value === TOP_LEVEL);
    expect(group?.subcategories).toBeUndefined();
  });
});
