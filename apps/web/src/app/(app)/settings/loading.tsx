import { SettingsSkeleton } from "@/features/settings/components/settings-skeleton";

/**
 * Built from the same layout components as the settings page, so the skeleton
 * occupies the space the content will occupy and nothing shifts on arrival.
 */
export default function Loading() {
  return <SettingsSkeleton />;
}
