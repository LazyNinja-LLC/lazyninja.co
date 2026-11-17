-- lazyninja.co API schema (MySQL 5.7+/8.x or MariaDB 10.3+).
-- Import once via cPanel → phpMyAdmin → Import, or:
--   mysql -u <user> -p <database> < schema.sql
-- Safe to re-run: every statement uses IF NOT EXISTS.
-- All timestamps are UTC.

SET NAMES utf8mb4;

-- Cached, already-filtered GitHub repos from both sources (LazyNinja-LLC org + WammumTy user).
-- Refreshed by `npm run sync` (cron) and on request when older than 6 hours.
CREATE TABLE IF NOT EXISTS github_repo_cache (
  repo_key   VARCHAR(200)  NOT NULL COMMENT 'owner/name, lowercase',
  source     ENUM('lazyninja', 'personal') NOT NULL,
  sort_order INT UNSIGNED  NOT NULL DEFAULT 0,
  data       LONGTEXT      NOT NULL COMMENT 'Project JSON',
  synced_at  DATETIME      NOT NULL,
  PRIMARY KEY (repo_key),
  KEY idx_repo_cache_source (source, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Small key/value table for sync bookkeeping (e.g. last successful GitHub sync).
CREATE TABLE IF NOT EXISTS sync_state (
  name       VARCHAR(64) NOT NULL,
  updated_at DATETIME    NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contact form submissions. The IP is never stored, only a salted hash for abuse handling.
CREATE TABLE IF NOT EXISTS contact_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at  DATETIME        NOT NULL,
  name        VARCHAR(100)    NOT NULL,
  email       VARCHAR(254)    NOT NULL,
  reason      ENUM('general', 'hire', 'recruiting') NOT NULL DEFAULT 'general',
  message     TEXT            NOT NULL,
  ip_hash     CHAR(64)        NOT NULL,
  user_agent  VARCHAR(255)    NULL,
  mail_status ENUM('sent', 'failed', 'skipped') NOT NULL DEFAULT 'sent',
  PRIMARY KEY (id),
  KEY idx_contact_created (created_at),
  KEY idx_contact_mail_status (mail_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fixed-window rate limit counters (e.g. 5 contact submissions per IP per hour).
-- Stored in MySQL so limits survive Passenger restarts and work across processes.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       VARCHAR(32)  NOT NULL,
  key_hash     CHAR(64)     NOT NULL,
  window_start DATETIME     NOT NULL,
  hits         INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key_hash, window_start),
  KEY idx_rate_limits_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cookie-free page views. visitor_hash = daily-rotating salted hash of IP + user agent.
-- No IPs are stored. Rows older than 13 months are purged by `npm run sync`.
CREATE TABLE IF NOT EXISTS page_views (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at    DATETIME        NOT NULL,
  day           DATE            NOT NULL,
  path          VARCHAR(512)    NOT NULL,
  referrer_host VARCHAR(255)    NULL,
  country       CHAR(2)         NULL,
  visitor_hash  CHAR(32)        NOT NULL,
  PRIMARY KEY (id),
  KEY idx_page_views_created (created_at),
  KEY idx_page_views_day_visitor (day, visitor_hash),
  KEY idx_page_views_day_path (day, path(191)),
  KEY idx_page_views_day_referrer (day, referrer_host(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
