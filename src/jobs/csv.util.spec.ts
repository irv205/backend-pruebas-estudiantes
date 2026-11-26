import { csvCell, toCsv } from './csv.util';

describe('csv util', () => {
  it('escapa comillas, comas y saltos de línea (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
  });

  it('genera cabecera y filas con CRLF', () => {
    const csv = toCsv(['id', 'name'], [['1', 'Producto, A']]);
    expect(csv).toBe('id,name\r\n1,"Producto, A"\r\n');
  });
});
