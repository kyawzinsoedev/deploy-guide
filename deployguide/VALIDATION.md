# Validation record

QA completed 2026-10-30; technical sources reviewed 2026-10-29. This records website behavior, generated-document checks and a local filesystem simulation. It does not certify a production server or an executed GitHub workflow.

## Automated checks

- **155 tests passed, zero failures, zero skipped** on this Windows development machine.
- Next.js 16.4.3 production build, strict TypeScript compilation and static export passed. The site is in `out/`.
- Generation covers all six application paths, Ubuntu 24.04 and Windows Server 2022/2025, npm/pnpm, www variants and PHP 8.2/8.3/8.4/8.5.
- Launch paths remain 5 steps for HTML, 6 for Vite/static Next, and 7 for runtime applications. CI/CD has its own optional six-step checklist.
- Input rejection, platform-specific paths, reserved Windows names, shell quoting, version consistency, Nginx/FPM sockets, IIS XML, WinSW identities, source links and complete Markdown content passed regression checks.
- Generated Bash and PowerShell blocks were parsed without executing their deployment commands. IIS/WinSW XML and workflow YAML were parsed. Workflow checks cover pinned action SHAs, hosted CI, restricted manual main-branch deployment, private repositories, environment gates, minimal token permissions and serialization.
- A separate Windows static-release simulation used a disposable directory inside this checkout, real directory junctions and local tar files. HTTP responses were simulated. It confirmed successful activation and restoration of the preceding release after a failed HTTP check, while preserving the bootstrap files. It did not change a service, IIS configuration or any real deployment directory.
- The final test output is retained locally under ignored `qa/final-test-results.txt`. Test fixtures were cleaned up only after checking their absolute paths remained within the test directory.

## Browser checks

The exported site was served by the included local preview tool. The final build was reloaded after source changes.

- Sidebar and typography follow-up: production build/static export and strict TypeScript passed. The expanded sidebar has its collapse control beside search, without an extra navigation heading. Collapsed mode retains clickable, named icons; tested guide-step navigation, search, CI/CD expansion, Enter/Space toggling and preference restoration after refresh. The desktop icon rail is 64px; the mobile menu restores full labels independently. Browser checks covered 1280px desktop, 820px tablet and 390px/320px phones. Main prose computed to 16px, navigation to 14px and code to 13px. Fixed the larger DNS label and narrow-phone tabs to fit their containers. Mobile landing cards and the scrollable configuration wizard were also inspected.

- Architecture-panel follow-up: rebuilt the static export with strict TypeScript checks. Verified desktop collapse reduces the panel to a 44px rail and expands the instructions, Enter/Space reopening and closing retain focus, hidden content is inert, and the saved choice survives refresh and step navigation. Checked open/closed mobile behavior at 390px and collapsed tablet/wide-desktop layouts at 820px/1536px without horizontal overflow. No browser console errors appeared. Reduced-motion behavior uses the existing global CSS override; an operating-system preference change was not tested.

- Selected Windows Server 2025 + Laravel + PHP 8.5 through the wizard. All four PHP options were visible, with compatibility/support guidance. The review correctly showed `C:\Sites\qa-guide`, Windows Server, PHP 8.5 and IIS FastCGI.
- Rejected a domain containing a shell separator. Changing the application name updated the default Windows directory. The seven-step Windows guide, IIS request diagram, version labels and configuration-download label matched the selection.
- Opened the optional CI/CD section, navigated its steps, used keyboard arrow navigation between tabs, copied the workflow and checked clipboard content.
- Browser downloads were confirmed on disk: `deployguide.yml` and `deploy.ps1`. The downloaded workflow contained Windows Server 2025, PHP 8.5, the chosen application label and production restrictions. Other guide/configuration contents are covered by generator tests.
- Marked a CI/CD step complete and reloaded. The selected step and checkmark were restored, independently of the launch checklist. Both cancel-reset and confirmed reset were exercised; the confirmation counted CI/CD progress correctly.
- Local CI/CD search returned results across all six stacks and all three OS choices. Current-OS results appeared first, and selecting the Windows Laravel result preserved the platform and PHP version.
- Inspected Paper Light, Midnight Blue and Forest Terminal visually, and verified Warm Sand selection. The four themes were also visually checked in the initial project build.
- Checked 390x844 mobile, 820x1180 tablet and 1280x900 desktop widths without document-level horizontal overflow. Fixed hidden mobile navigation remaining keyboard-accessible and verified its closed state uses `visibility: hidden`. Removed duplicate prerequisite text from the commands view. Corrected nested CI/CD sidebar buttons to share the regular navigation styling.
- Print content includes launch tasks, references, the optional CI/CD guide and sources. A physical/PDF print job was not executed.

## Technical source review

Primary documentation was consulted for Microsoft IIS/FastCGI/ARR, PHP Windows installation and supported branches, Laravel 12, GitHub Actions environments/runners/security, the pinned actions, PHP cache behavior and Windows service access rights. Links are shipped inside generated guides. The reviewed action release commits were read from their official GitHub repositories.

Ubuntu 24.04 defaults to PHP 8.3. Availability of the alternate PHP 8.2, 8.4 and 8.5 FPM packages was checked against the third-party PPA's Noble amd64 package index. The guide discloses that additional repository trust; this is an availability check, not an installation test. PHP 8.2's approaching support end is shown in the builder.

## Limits and operating scope

No commands were run on a live Ubuntu or Windows Server, and no GitHub workflow, runner or repository was created or activated. Native service privileges, web-worker PHP cache behavior, real application builds, certificate issuance, provider networking and live rollback require the documented staging rehearsal. Syntax tests and the local static-file simulation cannot prove those behaviors.

CI/CD targets trusted private, single-package GitHub repositories and requires an eligible private-environment plan. The production runner must be a restricted deployment account; labels alone do not secure it. Laravel migrations, background workers/scheduling, optional public upload links and application-specific health tests require explicit project review. Code rollback never implies database recovery. No zero-downtime or automatic server-verification claim is made.

The user's **Keep it local** preference remains in effect. No source upload or publication was performed. Local source and static-export archives are provided.

