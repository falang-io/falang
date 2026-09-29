-- Seed for the `mysql-user-db` e2e service — ADR 0039 (private)'s
-- "Consequences" e2e bullet. Mounted at /docker-entrypoint-initdb.d/ so mysql:8's own entrypoint
-- runs it once, on first init, against the `userdb` database created by MYSQL_DATABASE.
--
-- Same shape as postgres-user-db.sql's `orders` table, adjusted for MySQL's own types
-- (auto_increment id, decimal, datetime) — stands in for "the user's own database" a workflow
-- reads/writes via the mysql-select/-select-one/-insert/-update/-delete/-query node kinds.
create table orders (
  id int auto_increment primary key,
  status text not null,
  total decimal(10, 2),
  note text null,
  created_at datetime default current_timestamp
);

insert into orders (status, total, note) values ('new', 10.00, 'seed row 1');
insert into orders (status, total, note) values ('paid', 20.00, 'seed row 2');
