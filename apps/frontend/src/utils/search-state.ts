export type SearchFilters = {
  q: string;
  status: string;
  fromDate: string;
  toDate: string;
};

export function buildSearchQueryParams(
  filters: SearchFilters,
  page: number,
  pageSize: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = { page, pageSize, sort: 'updatedAt' };
  const q = filters.q.trim();
  if (q) {
    params.q = q;
  }
  if (filters.status) {
    params.status = filters.status;
  }
  if (filters.fromDate) {
    params.from = new Date(`${filters.fromDate}T00:00:00`).toISOString();
  }
  if (filters.toDate) {
    params.to = new Date(`${filters.toDate}T23:59:59.999`).toISOString();
  }
  return params;
}

export function shouldShowSearchUnavailable(available: boolean, loading: boolean): boolean {
  return !available && !loading;
}
