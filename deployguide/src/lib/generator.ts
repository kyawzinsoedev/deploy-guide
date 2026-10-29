import { generateLaunchGuide } from "@/content/launch-flow";
import { generateWindowsGuide } from "@/content/windows-guides";
import { isWindows } from "@/content/platforms";
import { assertValid } from "./validation";
import type { GuideConfig, Guide } from "./types";
import { generateAutomation, automationSources } from "@/content/automation";
export function generateGuide(c: GuideConfig): Guide {
  assertValid(c);
  const guide = isWindows(c.os)
    ? generateWindowsGuide(c)
    : generateLaunchGuide(c);
  return {
    ...guide,
    automation: generateAutomation(c),
    reviewedOn: "2026-10-29",
    sources: [...guide.sources, ...automationSources],
  };
}
export const guidePages = (guide: Guide) => [
  ...guide.steps,
  ...(guide.references ?? []),
  ...(guide.automation?.steps ?? []),
];
export { generateNginx, generateService } from "./commands";
