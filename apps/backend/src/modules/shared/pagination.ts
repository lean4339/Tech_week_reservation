export interface Page {
  limit: number;
  offset: number;
}
export interface PageQuery {
  limit?: string;
  offset?: string;
}
export function page(query: PageQuery) {
  return {
    limit: Number(query.limit ?? 50),
    offset: Number(query.offset ?? 0),
  };
}
