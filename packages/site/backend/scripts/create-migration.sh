echo -n "Enter migration name:"
read migrationName

sh ./scripts/setup-tests.sh

ENV_FILENAME=.test.env npm run typeorm -- \
-d ./src/domains/system/database/Database.datasource.ts \
migration:generate ./src/domains/system/database/migrations/$migrationName
