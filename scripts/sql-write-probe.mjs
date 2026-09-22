import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Injected only into the temporary local Worker bundle, never production code.
export const sqlWriteProbe = {
  name: 'sql-write-probe',
  setup(build) {
    build.onLoad({ filter: /\/tracker\.ts$/ }, async ({ path }) => {
      let contents = await readFile(path, 'utf8');
      const edits = [
        [
          'private readonly sql: SqlStorage;',
          'private readonly sql: SqlStorage; private probes = [];',
        ],
        [
          'this.sql = state.storage.sql;',
          `this.sql = new Proxy(state.storage.sql, {
            get: (target, key) => {
              if (key !== 'exec') return Reflect.get(target, key, target);
              return (query, ...bindings) => {
                const cursor = target.exec(query, ...bindings);
                this.probes.push({ query, cursor });
                return cursor;
              };
            },
          });`,
        ],
        ['await this.ready;', 'await this.ready; this.probes = [];'],
        [
          'return response;',
          `response.headers.set('X-Local-Sql-Writes', JSON.stringify(
            this.probes.map(({ query, cursor }) => ({
              query: query.replace(/\\s+/g, ' ').trim(),
              rowsWritten: cursor.rowsWritten,
            }))
          ));
          return response;`,
        ],
      ];
      for (const [before, after] of edits) {
        assert.equal(
          contents.split(before).length,
          2,
          `Probe anchor changed: ${before}`,
        );
        contents = contents.replace(before, after);
      }
      return { contents, loader: 'ts' };
    });
  },
};
