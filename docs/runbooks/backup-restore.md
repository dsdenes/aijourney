# Backup And Restore Procedure

## Scope

The production stack stores durable state in Docker volumes:

- `mongo_data`
- `redis_data`

Redis is reconstructible for some workloads, but it still affects queue recovery and should be captured with MongoDB during backups.

## Backup Procedure

### MongoDB

1. Run `mongodump` against the production MongoDB container.
2. Store the archive in encrypted object storage with timestamped naming.
3. Retain at least one daily and one weekly backup generation.

Suggested command pattern:

```bash
docker compose -f docker-compose.server.yml exec -T mongodb \
  mongodump --archive --gzip > "backup-mongodb-$(date +%F-%H%M%S).archive.gz"
```

### Redis

1. Trigger a `BGSAVE` or capture the Redis data volume snapshot.
2. Store the resulting `dump.rdb` with the same timestamp as the MongoDB backup.

Suggested command pattern:

```bash
docker compose -f docker-compose.server.yml exec -T redis redis-cli BGSAVE
docker cp "$(docker compose -f docker-compose.server.yml ps -q redis)":/data/dump.rdb ./dump-redis-$(date +%F-%H%M%S).rdb
```

## Restore Procedure

### MongoDB restore

1. Stop writers or enter maintenance mode.
2. Confirm the target environment and backup file checksum.
3. Restore with `mongorestore --drop` only when intentionally replacing the target dataset.

Suggested command pattern:

```bash
cat backup-mongodb-YYYY-MM-DD-HHMMSS.archive.gz | gunzip | \
docker compose -f docker-compose.server.yml exec -T mongodb \
  mongorestore --archive --drop
```

### Redis restore

1. Stop services that write to Redis.
2. Replace `dump.rdb` in the Redis volume.
3. Restart the Redis container.
4. Restart `api` and `worker` so queue clients reconnect cleanly.

## Restore Validation

1. Confirm `api/health/ready` returns `200`.
2. Confirm expected tenant, user, and article counts in MongoDB.
3. Confirm BullMQ queues are reachable.
4. Confirm a basic login and one authenticated API call work.

## Test Cadence

- Perform a restore drill in a non-production environment at least once per release cycle.
- Record the backup timestamp used, restore duration, and any manual fixes required.
