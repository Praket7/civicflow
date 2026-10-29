import type { WorkAreaTab } from "../components/navigation/WorkAreaTabs";

export const peopleTabs: WorkAreaTab[] = [
  { label: "Volunteers", to: "/coordinator/volunteers" },
  { label: "Applications", to: "/coordinator/applications" },
  { label: "Credentials", to: "/coordinator/credentials" },
  { label: "Hours", to: "/coordinator/hours" },
  { label: "Records", to: "/coordinator/records" },
];

export const reportTabs: WorkAreaTab[] = [
  { label: "Overview", to: "/coordinator/reports", end: true },
  { label: "Impact", to: "/coordinator/impact" },
  { label: "Engagement", to: "/coordinator/insights" },
  { label: "Builder", to: "/coordinator/reports/custom" },
  { label: "Preview", to: "/coordinator/reports/preview" },
];

export const scheduleTabs: WorkAreaTab[] = [
  { label: "Calendar", to: "/coordinator/schedule" },
  { label: "Attendance", to: "/coordinator/attendance" },
  { label: "Kiosk", to: "/coordinator/kiosk" },
];

export const hoursTabs: WorkAreaTab[] = [
  { label: "Hours", to: "/volunteer/hours", end: true },
  { label: "Impact", to: "/volunteer/impact" },
  { label: "Verification", to: "/volunteer/verification" },
];
