/**
 * DB 클라이언트 — SQLite (로컬 개발) / PostgreSQL (배포)
 *
 * 환경 변수:
 *   DATABASE_URL — SQLite 파일 경로 또는 PostgreSQL 연결 문자열
 *   DATABASE_URL 미설정 시 ./possessed.db를 기본값으로 사용
 *
 * 보안:
 *   DATABASE_URL은 서버 전용 환경 변수. 클라이언트에 노출 금지.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

function createClient() {
  const dbUrl = process.env.DATABASE_URL ?? './possessed.db';

  // PostgreSQL URL이면 오류 안내 (로컬에서는 SQLite만 지원)
  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    throw new Error(
      'PostgreSQL is supported in production only. ' +
      'For local development, set DATABASE_URL to a .db file path (e.g. ./possessed.db).'
    );
  }

  const sqlite = new Database(dbUrl);

  // WAL 모드: 읽기/쓰기 동시성 향상
  sqlite.pragma('journal_mode = WAL');
  // 외래키 제약 활성화
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}

/** DB 클라이언트 싱글턴 */
export const db = createClient();

export type DB = typeof db;
