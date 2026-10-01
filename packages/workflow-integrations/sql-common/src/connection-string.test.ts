import { describe, expect, it } from 'vitest';
import { SqlConnectionStringError, isIpLiteral, parseSqlConnectionString } from './connection-string.js';

describe('parseSqlConnectionString', () => {
  it('parses a plain postgres URI into separate fields', () => {
    expect(
      parseSqlConnectionString('postgres', 'postgres://us%40er:p%2Fw@db.example.com:5433/my_db?sslmode=require'),
    ).toEqual({
      host: 'db.example.com',
      port: 5433,
      user: 'us@er',
      password: 'p/w',
      database: 'my_db',
    });
  });

  it('parses a mysql URI and an IPv6 host', () => {
    const parsed = parseSqlConnectionString('mysql', 'mysql://u:p@[2001:db8::1]:3307/d');
    expect(parsed.host).toBe('2001:db8::1');
    expect(parsed.port).toBe(3307);
  });

  it.each([
    'postgres://u:p@h/db?sslrootcert=/etc/passwd',
    'postgres://u:p@h/db?sslcert=/x',
    'postgres://u:p@h/db?sslkey=/x',
    'postgres://u:p@h/db?sslcrl=/x',
    'postgres://u:p@h/db?passfile=/x',
    'postgres://u:p@h/db?service=x',
    'postgres://u:p@h/db?host=/var/run/postgresql',
    'postgres://u:p@h/db?SSLROOTCERT=/x',
    'postgres://u:p@/db',
    'postgres://u:p@%2Fvar%2Frun%2Fpostgresql/db',
    'postgres:///db?host=/var/run',
    'host=/var/run user=x dbname=y',
    '/var/run/postgresql',
    'mysql://u:p@h/db',
  ])('rejects %s for postgres', (value) => {
    expect(() => parseSqlConnectionString('postgres', value)).toThrow(SqlConnectionStringError);
  });

  it.each([
    'mysql://u:p@h/db?socketPath=/var/run/mysqld/mysqld.sock',
    'mysql://u:p@h/db?localInfile=true',
    'mysql://u:p@h/db?flags=%2BLOCAL_FILES',
    'mysql://u:p@h/db?infileStreamFactory=x',
    'mysql://u:p@h/db?ssl=%7B%22ca%22%3A%22%2Fx%22%7D',
    'mysql://u:p@/db',
    'postgres://u:p@h/db',
    'not a url',
  ])('rejects %s for mysql', (value) => {
    expect(() => parseSqlConnectionString('mysql', value)).toThrow(SqlConnectionStringError);
  });

  it('accepts the allow-listed mysql parameters', () => {
    expect(parseSqlConnectionString('mysql', 'mysql://u:p@h/db?charset=utf8mb4&timezone=Z').host).toBe('h');
  });
});

describe('isIpLiteral', () => {
  it('distinguishes IP literals from names', () => {
    expect(isIpLiteral('10.0.0.1')).toBe(true);
    expect(isIpLiteral('2001:db8::1')).toBe(true);
    expect(isIpLiteral('db.example.com')).toBe(false);
  });
});
