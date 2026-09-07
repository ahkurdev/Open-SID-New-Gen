# Backup & Recovery — Village OS

## Backup Otomatis

```bash
bash scripts/backup-db.sh              # ke ./backups/
bash scripts/backup-db.sh /d/backups   # ke folder lain
```

- Format: pg_dump custom (compressed), nama file `village_os_YYYYMMDD_HHMMSS.dump`
- Retensi otomatis: backup > 14 hari dihapus

Jadwalkan harian (Windows Task Scheduler):
```
Program: bash
Arguments: C:/Allan/CODE/WEB/PROJECT PORTO/OPEN SID UPDGRADE/scripts/backup-db.sh
Trigger: Daily 22:00
```

## Restore Procedure

```bash
# 1. Stop aplikasi (dev server)
# 2. Drop & recreate database
vendor/pgsql/bin/psql.exe -d "postgresql://postgres:villageos@127.0.0.1:54329/postgres" \
  -c "DROP DATABASE IF EXISTS village_os;"
vendor/pgsql/bin/psql.exe -d "postgresql://postgres:villageos@127.0.0.1:54329/postgres" \
  -c "CREATE DATABASE village_os;"

# 3. Restore dari backup
vendor/pgsql/bin/pg_restore.exe -d "postgresql://postgres:villageos@127.0.0.1:54329/village_os" \
  backups/village_os_YYYYMMDD_HHMMSS.dump

# 4. Start aplikasi, cek /api/health
```

## Verifikasi Backup

```bash
# List isi backup tanpa restore
vendor/pgsql/bin/pg_restore.exe -l backups/village_os_YYYYMMDD_HHMMSS.dump | head -20
```

## Checklist Restore Drill (lakukan 1x per bulan)

1. [ ] Backup terbaru tersedia
2. [ ] Restore ke database test berhasil
3. [ ] Login test: admin@sinar-mulyo.test / Password123!
4. [ ] Data penduduk tampil
5. [ ] Surat bisa dibuat
