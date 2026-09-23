const PAGE_SIZE = 1000;

/**
 * Runs a select page by page: the API returns at most 1000 rows per request. The query must have a
 * stable order (e.g. `.order("id")`) so pages neither overlap nor skip rows.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}
