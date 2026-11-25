/**
 * Fail-closed guards for the dedicated PostgreSQL auth test database.
 * Never reads DATABASE_URL. Never logs raw URLs, usernames, passwords, or query params.
 */

export const PG_AUTH_TEST_DB_NAME = 'it_gst_management_test';
export const PG_AUTH_TEST_CONFIRM_ENV = 'PG_AUTH_TEST_CONFIRM';
export const PG_AUTH_TEST_DATABASE_URL_ENV = 'PG_AUTH_TEST_DATABASE_URL';

const DEV_DB_NAME = 'it_gst_management_dev';

export type PgAuthTestTarget = {
  /** Validated connection string — callers must not log this. */
  connectionString: string;
  host: string;
  database: string;
};

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * Validate PG_AUTH_TEST_DATABASE_URL + PG_AUTH_TEST_CONFIRM for the auth test suite.
 * Does not open a database connection.
 */
export function assertPgAuthTestTarget(
  env: NodeJS.ProcessEnv = process.env
): PgAuthTestTarget {
  const confirm = String(env[PG_AUTH_TEST_CONFIRM_ENV] || '').trim();
  if (!confirm) {
    throw new Error(
      `Refusing to proceed: set ${PG_AUTH_TEST_CONFIRM_ENV}=${PG_AUTH_TEST_DB_NAME}.`
    );
  }
  if (confirm !== PG_AUTH_TEST_DB_NAME) {
    throw new Error(
      `Refusing to proceed: ${PG_AUTH_TEST_CONFIRM_ENV} must be exactly "${PG_AUTH_TEST_DB_NAME}".`
    );
  }

  const connectionString = String(env[PG_AUTH_TEST_DATABASE_URL_ENV] || '').trim();
  if (!connectionString) {
    throw new Error(
      `Refusing to proceed: ${PG_AUTH_TEST_DATABASE_URL_ENV} is missing. ` +
        `DATABASE_URL is never used as a fallback.`
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      `${PG_AUTH_TEST_DATABASE_URL_ENV} is not a valid URL.`
    );
  }

  const protocol = url.protocol.replace(/:$/, '');
  if (protocol !== 'postgresql' && protocol !== 'postgres') {
    throw new Error(
      `Refusing database protocol "${protocol}". Only postgresql is allowed.`
    );
  }

  const host = (url.hostname || '').toLowerCase();
  if (!isLoopbackHost(host)) {
    throw new Error(
      `Refusing host "${host || '(empty)'}". Only localhost or 127.0.0.1 is allowed.`
    );
  }

  const database = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
  if (!database) {
    throw new Error(
      `Refusing empty database name. Only "${PG_AUTH_TEST_DB_NAME}" is allowed.`
    );
  }
  if (database === DEV_DB_NAME) {
    throw new Error(
      `Refusing development database "${DEV_DB_NAME}". Use "${PG_AUTH_TEST_DB_NAME}" only.`
    );
  }
  if (database !== PG_AUTH_TEST_DB_NAME) {
    throw new Error(
      `Refusing database "${database}". Only "${PG_AUTH_TEST_DB_NAME}" is allowed.`
    );
  }

  return { connectionString, host, database };
}
