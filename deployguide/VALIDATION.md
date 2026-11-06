# Validation record

Final website QA completed 2026-10-31. Apache, database and Laravel upload sources were reviewed on 2026-10-30; earlier PHP branch and CI/CD source review was completed on 2026-10-29. This records website behavior, generated-document checks and a local filesystem simulation. It does not certify a production server or an executed GitHub workflow.

## Automated checks

- **164 tests passed, zero failures, zero skipped** on this Windows development machine. Final output: ignored `qa/test-apache.log`.
- Next.js 16.4.3 production build, strict TypeScript compilation and static export passed. The deployable website is in `out/`.
- Generation covers all six application paths, Ubuntu 24.04, Windows Server 2022/2025, npm/pnpm, www variants and PHP 8.2/8.3/8.4/8.5.
- Launch paths contain 5 steps for HTML, 6 for Vite/static Next, 7 for Node applications and 8 for Laravel including its conditional database setup. CI/CD retains its separate six-step checklist.
- Input validation, shell quoting, reserved Windows paths, PHP branch consistency, Nginx/FPM sockets, WinSW identities, source links and complete Markdown content passed regression checks.
- Generated Bash and PowerShell blocks were parsed without executing deployment commands. WinSW XML and workflow YAML were parsed. Apache configuration received structural/generation checks, not a real httpd configuration test on a server.
- Apache regression checks cover initial HTTP without nonexistent certificates, final TLS file paths, public Laravel roots, blocked nested/uploaded PHP paths, private Node proxy targets, forwarded-header handling and ACME access outside application releases.
- Database checks cover schema/account name lengths, loopback settings, omission of secret values, conditional existing-database guidance and MySQL-only random-password syntax. Windows/Laravel progress keys use a new revision so old checkmarks cannot imply the revised tasks were completed.
- CI/CD checks cover pinned action SHAs, hosted CI, manual main-branch deployment, trusted private repositories, environment gates, minimal permissions and serialization. Windows releases no longer copy web.config or grant IIS pool permissions; administrator-owned Apache configuration remains outside the release artifact.
- A disposable Windows static-release simulation used real directory junctions and local tar files with simulated HTTP responses. It confirmed activation and recovery after a failed HTTP check. It did not change services, Apache configuration or real deployment folders. Fixtures were cleaned only within their checked workspace paths.

## Browser checks

The static export was served locally. The final build was opened again after the last wording and sidebar-label changes.

- Windows Server 2022 + Laravel + PHP 8.4 generated the correct eight-step Apache guide, personalized C:\\Sites path, diagram and download label. The PHP selector displayed all four branches. The previously saved Windows 2025/PHP 8.5 configuration also rendered the new Apache path.
- Opened Prepare MariaDB and the upload/build task; checked the private database account instructions, production settings and conditional React/Vite build. Required-in-context work is labeled “When needed,” with its applicability explained, instead of an unconditional “Optional” badge.
- The schema copy button returned the expected personalized SQL. Downloaded `qa-apache.apache.conf` through the browser and inspected the saved file: selected hostname/www alias, public root, challenge path and PHP guard were present.
- Local search found MariaDB instructions for both Windows versions. Searching Prepare MySQL and opening the result switched to Ubuntu 24.04, PHP-FPM, Nginx configuration download and the correct MySQL task before production configuration.
- Desktop 1280px and phone 390px checks showed no document-level horizontal overflow. Mobile menu navigation reached the upload task. Existing architecture/sidebar collapse behavior remained available. No browser console errors appeared in the final check.
- Screenshot proof is retained locally at `qa/apache-mariadb-guide.png`.

Earlier UI checks in this project covered sidebar icon navigation, search, keyboard Enter/Space collapse controls, architecture collapse, preference restoration, all four themes, step/checklist persistence, reset confirmation, CI/CD downloads, and phone/tablet/desktop widths. These features were preserved; this follow-up focused on the changed Windows/Ubuntu documentation and configuration outputs. Print content includes launch tasks, references, CI/CD and sources; a physical/PDF print job was not executed.

## Technical sources and limits

Primary Apache, PHP, MariaDB, MySQL/Ubuntu, HeidiSQL, Laravel and win-acme documentation informed the replacement Windows path and database/upload instructions. Source links are shipped in each guide. PHP version choices and GitHub Actions references retain their documented review dates and compatibility caveats.

**No live Ubuntu or Windows Server deployment was executed.** Apache/PHP integration, database installation, native service permissions, real application builds, certificate issuance/renewal, provider networking, PHP cache behavior under junction releases and live rollback must be rehearsed on a matching staging server before production. Website tests and shell parsing cannot prove those behaviors.

The baseline uses one Apache installation and one PHP version on Windows, with a dedicated non-administrator web account. Multi-tenant isolation, Inertia SSR, Reverb and native Windows production queue workers are outside this baseline. CI/CD requires trusted private single-package repositories, appropriate environment access, a restricted runner and project-specific health checks. Code rollback does not reverse database changes. No zero-downtime or automatic server-verification claim is made.

The user's **Keep it local** preference remains in effect. Nothing was uploaded or published. Source and static-export archives are supplied locally.

