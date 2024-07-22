docker run --name falang-postgres -e POSTGRES_PASSWORD=falang -e POSTGRES_USER=falang -e POSTGRES_DB=falang -d postgres -p 5444:5432


psql -h localhost -U falang -p 5444 falang