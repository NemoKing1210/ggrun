export type Pagination = { page: number; pageSize: number; total: number };
export type Paginated<T> = { items: T[]; pagination: Pagination };
