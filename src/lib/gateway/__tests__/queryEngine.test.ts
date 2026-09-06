import { parseFilter, parseSort, parseQuery, matchesClause, applyQuery } from '@/lib/gateway/queryEngine';

const rows = () => [
  { id: 'a', name: 'Charlie', department: 'Engineering', level: 3 },
  { id: 'b', name: 'alice', department: 'Sales', level: 5 },
  { id: 'c', name: 'Bob', department: 'Engineering', level: 1 },
  { id: 'd', name: 'Diana', department: 'Marketing', level: 5 },
];

describe('query engine (F-078)', () => {
  describe('parseFilter', () => {
    it('parses clauses and preserves values containing colons', () => {
      const { clauses, errors } = parseFilter('department:eq:Engineering,url:contains:http://x');
      expect(errors).toEqual([]);
      expect(clauses).toEqual([
        { field: 'department', op: 'eq', value: 'Engineering' },
        { field: 'url', op: 'contains', value: 'http://x' },
      ]);
    });
    it('reports malformed clauses and unknown operators', () => {
      expect(parseFilter('bad').errors[0]).toMatch(/expected field:op:value/);
      expect(parseFilter('name:zzz:x').errors[0]).toMatch(/Unknown filter operator/);
    });
    it('returns empty for no filter', () => {
      expect(parseFilter(undefined).clauses).toEqual([]);
    });
  });

  describe('parseSort', () => {
    it('parses multi-field sort with direction', () => {
      expect(parseSort('-level,name').clauses).toEqual([
        { field: 'level', dir: 'desc' },
        { field: 'name', dir: 'asc' },
      ]);
    });
  });

  describe('matchesClause', () => {
    it('compares numerically when both sides are numbers', () => {
      expect(matchesClause({ level: 5 }, { field: 'level', op: 'gt', value: '3' })).toBe(true);
      expect(matchesClause({ level: 5 }, { field: 'level', op: 'lte', value: '5' })).toBe(true);
    });
    it('does case-insensitive string ops', () => {
      expect(matchesClause({ name: 'Alice' }, { field: 'name', op: 'eq', value: 'alice' })).toBe(true);
      expect(matchesClause({ name: 'Charlie' }, { field: 'name', op: 'contains', value: 'har' })).toBe(true);
      expect(matchesClause({ name: 'Charlie' }, { field: 'name', op: 'startsWith', value: 'Ch' })).toBe(true);
    });
    it('handles `in` as a pipe list', () => {
      expect(matchesClause({ department: 'Sales' }, { field: 'department', op: 'in', value: 'Sales|Engineering' })).toBe(true);
      expect(matchesClause({ department: 'HR' }, { field: 'department', op: 'in', value: 'Sales|Engineering' })).toBe(false);
    });
  });

  describe('applyQuery', () => {
    it('filters with AND semantics across clauses', () => {
      const spec = parseQuery({ filter: 'department:eq:Engineering,level:gt:1' });
      const res = applyQuery(rows(), spec);
      expect(res.matched).toBe(1);
      expect(res.rows[0].id).toBe('a'); // Charlie, Eng, level 3
      expect(res.total).toBe(4);
      expect(res.filtersApplied).toBe(2); // two clauses ANDed
    });

    it('sorts numerically descending, then by a tiebreak field', () => {
      const spec = parseQuery({ sort: '-level,name' });
      const res = applyQuery(rows(), spec);
      // level desc: 5,5,3,1 → among the two 5s, name asc: alice(b) then Diana(d)
      expect(res.rows.map((r) => r.id)).toEqual(['b', 'd', 'a', 'c']);
    });

    it('is stable for equal sort keys (input order preserved)', () => {
      const spec = parseQuery({ sort: 'department' });
      const res = applyQuery(rows(), spec);
      // The two Engineering rows keep their original relative order (a before c).
      const eng = res.rows.filter((r) => r.department === 'Engineering').map((r) => r.id);
      expect(eng).toEqual(['a', 'c']);
    });

    it('combines filter + sort', () => {
      const spec = parseQuery({ filter: 'level:gte:3', sort: '-name' });
      const res = applyQuery(rows(), spec);
      expect(res.matched).toBe(3); // Charlie(3), alice(5), Diana(5)
      expect(res.rows.map((r) => r.id)).toEqual(['d', 'a', 'b']); // Diana, Charlie, alice (name desc, case-insensitive)
    });

    it('does not mutate the input array', () => {
      const input = rows();
      const snapshot = input.map((r) => r.id);
      applyQuery(input, parseQuery({ sort: '-level' }));
      expect(input.map((r) => r.id)).toEqual(snapshot);
    });

    it('is deterministic', () => {
      const spec = parseQuery({ filter: 'department:in:Sales|Marketing', sort: '-level,name' });
      expect(applyQuery(rows(), spec)).toEqual(applyQuery(rows(), spec));
    });
  });
});
