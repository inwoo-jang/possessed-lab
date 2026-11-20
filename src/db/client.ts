/**
 * DB 클라이언트 — SQLite (로컬 개발) / PostgreSQL (배포)
 *
 * 환경 변수:
 *   DATABASE_URL — SQLite 파일 경로 또는 PostgreSQL 연결 문자열
 *   DATABASE_URL 미설정 시 ./possessed.db를 기본값으로 사용
 *
 * 보안:
 *   DATABASE_URL은 서버 전용 환경 변수. 클라이언트에 노출 금지.
 *
 * 지연 생성(lazy):
 *   모듈을 import하는 것만으로 DB 파일이 열리거나 만들어지지 않도록
 *   getDb()를 처음 호출할 때 연결한다. (next build가 라우트 모듈을 평가할 때의 부작용 방지)
 */

import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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

  const client = drizzle(sqlite, { schema });

  // 적용된 마이그레이션은 건너뛰므로 여러 번 호출해도 안전하다.
  // drizzle-kit migrate와 같은 __drizzle_migrations 테이블을 사용한다.
  migrate(client, { migrationsFolder: path.join(process.cwd(), 'src/db/migrations') });

  return client;
}

export type DB = ReturnType<typeof createClient>;

let instance: DB | undefined;

/** DB 클라이언트 싱글턴. 처음 호출될 때 연결하고 마이그레이션을 적용한다. */
export function getDb(): DB {
  if (!instance) instance = createClient();
  return instance;
}
