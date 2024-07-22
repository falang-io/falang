#!/usr/bin/env bash

docker container rm -f -v falang_postgres_test

docker create --name=falang_postgres_test \
  -e POSTGRES_PASSWORD=falang \
  -e POSTGRES_USER=falang \
  -e POSTGRES_DB=falang \
  -p 5444:5432 \
  postgres:15.1

docker start falang_postgres_test

npm run typeorm:test:run-migrations
