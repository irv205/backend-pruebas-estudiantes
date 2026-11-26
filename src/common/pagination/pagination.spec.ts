import { getPageParams, paginate } from './pagination';

describe('pagination', () => {
  it('calcula skip/take y limita el tamaño de página', () => {
    expect(getPageParams({ page: 3, limit: 10 })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
      take: 10,
    });
    expect(getPageParams({ page: 0, limit: 1000 }).limit).toBe(100);
  });

  it('devuelve el contrato { data, meta }', () => {
    expect(paginate([1, 2], 5, 1, 2)).toEqual({
      data: [1, 2],
      meta: { page: 1, limit: 2, total: 5, totalPages: 3 },
    });
  });
});
