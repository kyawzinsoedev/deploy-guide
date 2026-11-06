import type { CodeBlock, GuideConfig, Source, Step } from "@/lib/types";
import { isWindows } from "./platforms";

export const databaseName = (c: GuideConfig) => c.appName.replaceAll("-", "_");
// MySQL accounts have a smaller name limit than application directories.
export const databaseUser = (c: GuideConfig) =>
  databaseName(c).slice(0, 28) + "_app";
export const databaseSources: Source[] = [
  {
    label: "Ubuntu: MySQL installation",
    url: "https://documentation.ubuntu.com/server/how-to/databases/install-mysql/",
  },
  {
    label: "MySQL 8: account creation and generated passwords",
    url: "https://dev.mysql.com/doc/refman/8.0/en/create-user.html",
  },
  {
    label: "MariaDB: Windows MSI installation",
    url: "https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/installing-mariadb-msi-packages-on-windows",
  },
  { label: "MariaDB 11.4 LTS", url: "https://mariadb.org/11-4-lts/" },
  {
    label: "HeidiSQL: connecting and managing users",
    url: "https://www.heidisql.com/help.php",
  },
];

export function databaseStep(c: GuideConfig): Step {
  const win = isWindows(c.os),
    db = databaseName(c),
    user = databaseUser(c);
  const block = (
    title: string,
    code: string,
    language: CodeBlock["language"],
    changes = true,
  ): CodeBlock => ({
    title,
    code,
    language,
    changes,
    location: "Server · administrator",
  });
  return {
    id: "database-ready",
    title: win ? "Prepare MariaDB" : "Prepare MySQL",
    goal: "Give Laravel a private database and an account limited to that database.",
    why: "Laravel stores application data here. Database-backed sessions, caches and queues also need their tables. A separate database account limits the impact of a leaked application credential.",
    how: win
      ? "MariaDB runs as a Windows service. HeidiSQL is a local administration tool; Laravel connects with its own account over loopback using the mysql driver."
      : "Ubuntu installs MySQL as a service. An administrator creates the schema and a database-only account; Laravel connects locally using the mysql driver.",
    before: `Administrator on the server; any working directory. This is a NEW local-database recipe. If an existing or managed database is already provisioned, skip installation and account creation, confirm compatibility, private access and backups, and use its connection details. Database credentials are entered on the server only.`,
    blocks: win
      ? [
          block(
            "Install MariaDB and limit network access",
            `1. Download the current patched MariaDB 11.4 LTS x64 MSI from mariadb.org. Check the publisher/signature and release notes.
2. Install Database instance as a Windows service (default name MariaDB) and the optional HeidiSQL client. Set a strong root password locally; disable remote root login and anonymous accounts.
3. Keep TCP networking enabled for Laravel. In the installed instance's my.ini, under [mysqld], set bind-address=127.0.0.1. Back up that file before editing; restart only this MariaDB service after saving.
4. Do not open database port 3306 in Windows or provider firewalls. Test the listener below before proceeding.`,
            "text",
          ),
          block(
            "Create the application schema in HeidiSQL",
            `-- Connect locally as the database administrator, then use a Query tab.
-- Stop if this schema already exists; inspect it instead of replacing it.
CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
            "sql",
          ),
          block(
            "Create a restricted application account",
            `In HeidiSQL: Tools → User manager → Add.
User: ${user}
From host: 127.0.0.1
Set a strong password privately here and store it in your approved password manager.
Add object → select database ${db}. Grant privileges on this database only, without GRANT OPTION. Leave global privileges empty.
Save. Create a new HeidiSQL session using this account, TCP/IP host 127.0.0.1, port 3306, database ${db}.
Connect and check that it can access this database. Never use root in Laravel's .env.`,
            "text",
          ),
        ]
      : [
          block(
            "Install the Ubuntu database service",
            `sudo apt update
sudo apt install -y mysql-server
sudo systemctl status mysql --no-pager
# Inspect /etc/mysql/mysql.conf.d/mysqld.cnf: bind-address must be 127.0.0.1.
# If changing it, back up the file first and restart only mysql afterward.
sudo ss -ltnp '( sport = :3306 )'`,
            "bash",
          ),
          block(
            "Open the local database administrator console",
            "sudo mysql\n# Run the SQL block below at the mysql> prompt, not in Bash.",
            "bash",
          ),
          block(
            "Create a database and application account",
            `CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
-- Store the password returned above privately; do not share the output.
GRANT ALL PRIVILEGES ON \`${db}\`.* TO '${user}'@'127.0.0.1';
SHOW GRANTS FOR '${user}'@'127.0.0.1';
EXIT;`,
            "sql",
          ),
        ],
    breakdown: [
      {
        term: "127.0.0.1",
        explanation:
          "Loopback means this server only. The database stays off the public network. A managed remote database requires its own private-network and TLS settings.",
      },
      {
        term: "Database-only privileges",
        explanation:
          "The account can create and modify tables for this app, including migrations, but cannot administer the entire server. Larger deployments can separate a migration account from a more restricted runtime account.",
      },
      {
        term: win ? "HeidiSQL" : "RANDOM PASSWORD",
        explanation: win
          ? "A database client, not the database server. It lets you enter a new password privately without embedding it in a copied command."
          : "MySQL generates a password and returns it once. This MySQL syntax is not used for MariaDB. Do not put it in terminal recordings, Git, chat or this website.",
      },
    ],
    expected:
      "The database service listens locally, the application's schema exists, and its own account can connect. No public database firewall rule was added.",
    verification: win
      ? block(
          "Check the database listener and account",
          `Get-Service -Name MariaDB
Get-NetTCPConnection -LocalPort 3306 -State Listen
# Expect 127.0.0.1, not 0.0.0.0 or ::. Then test the app account in HeidiSQL.`,
          "powershell",
          false,
        )
      : block(
          "Test as the application database user",
          `mysql --protocol=TCP --host=127.0.0.1 --user=${user} --password ${db} --execute='SELECT DATABASE(), CURRENT_USER();'
# --password prompts privately; never append the password to this command.`,
          "bash",
          false,
        ),
    problems: [
      {
        symptom: "SQLSTATE access denied or connection refused",
        cause:
          "Wrong host/account/password, a stopped service, or an incorrect listener.",
        fix: "Check the database service and loopback listener first. Test the exact application account privately; compare DB_HOST and the account's host restriction. Do not open port 3306 publicly to fix a local connection.",
        tags: ["database", "mysql", "mariadb", "SQLSTATE"],
      },
    ],
    next: "Upload the project and put the working database connection in its private .env file.",
    note: "No database needed? Skip this step only if the app and its session/cache/queue drivers do not use one. SQLite or an existing database needs its own approved storage and backup setup. The React starter kit normally needs a database for user accounts.",
  };
}

export function laravelEnvironment(c: GuideConfig): string {
  return `APP_ENV=production
APP_DEBUG=false
APP_URL=https://${c.domain}
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=${databaseName(c)}
DB_USERNAME=${databaseUser(c)}
# Set DB_PASSWORD privately in the server's .env; it is intentionally omitted here.
# Keep your existing APP_KEY. Generate a key only for a new environment.
# Keep session/cache/queue drivers consistent with the tables and workers your app uses.`;
}
