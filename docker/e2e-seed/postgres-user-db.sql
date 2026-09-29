-- Seed for the `postgres-user-db` e2e service — ADR 0039 (private)'s
-- "Consequences" e2e bullet. Mounted at /docker-entrypoint-initdb.d/ so postgres:16's own
-- entrypoint runs it once, on first init, against the `userdb` database created by
-- POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD.
--
-- This table stands in for "the user's own database" a workflow reads/writes via the
-- postgres-select/-select-one/-insert/-update/-delete/-query node kinds
-- (packages/workflow-integrations/sql-common/src/build-sql-integration.ts).
create table orders (
  id serial primary key,
  status text not null,
  total numeric(10, 2),
  note text null,
  created_at timestamptz default now()
);

insert into orders (status, total, note) values ('new', 10.00, 'seed row 1');
insert into orders (status, total, note) values ('paid', 20.00, 'seed row 2');
