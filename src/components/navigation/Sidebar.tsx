import { useEffect, useRef, useState } from "react";
import {
  Accessibility,
  BadgeCheck,
  BarChart3,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Compass,
  DatabaseBackup,
  FileCheck2,
  FolderOpen,
  Gauge,
  HeartHandshake,
  HelpCircle,
  Home,
  Inbox,
  Lightbulb,
  LogOut,
  MessageCircleQuestion,
  PanelLeftClose,
  Pin,
  Sparkles,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import type { ShellRole } from "../../app/routes";
import { useAuth } from "../../lib/auth/session";
import { t } from "../../lib/i18n";
import { initialsOf } from "../../lib/initials";
import { setCurrentOrganization } from "../../lib/organizations/store";
import { useOrganizationWorkspace } from "../../lib/organizations/useOrganizationWorkspace";
import { useNotifications } from "../../lib/workspace/queries";
import { useWorkspace } from "../../lib/workspace/session";
import { Avatar } from "../ui/Avatar";
import styles from "./Sidebar.module.css";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  showsUnread?: boolean;
  accent?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const coordinatorGroups: NavGroup[] = [
  {
    label: "Work",
    items: [
      { label: "AutoRoster", to: "/coordinator/autoroster", icon: Sparkles, accent: true },
      { label: "Mission Control", to: "/coordinator/mission-control", icon: Gauge },
      { label: "Ask CivicFlow", to: "/ask", icon: MessageCircleQuestion },
      { label: "Schedule", to: "/coordinator/schedule", icon: CalendarDays },
      { label: "Volunteers", to: "/coordinator/volunteers", icon: Users },
      { label: "Opportunities", to: "/coordinator/opportunities", icon: BriefcaseBusiness },
      { label: "Coverage", to: "/coordinator/coverage", icon: ShieldCheck },
      { label: "Attendance", to: "/coordinator/attendance", icon: ClipboardCheck },
    ],
  },
  {
    label: "Understand",
    items: [
      { label: "Reports", to: "/coordinator/reports", icon: BarChart3 },
      { label: "Impact", to: "/coordinator/impact", icon: HeartHandshake },
      { label: "Insights", to: "/coordinator/insights", icon: Lightbulb },
      { label: "Credentials", to: "/coordinator/credentials", icon: BadgeCheck },
    ],
  },
  {
    label: "Organize",
    items: [
      { label: "Applications", to: "/coordinator/applications", icon: Inbox },
      { label: "Records", to: "/coordinator/records", icon: FolderOpen },
      { label: "Audit log", to: "/coordinator/audit", icon: ScrollText },
      { label: "Backups", to: "/coordinator/backup", icon: DatabaseBackup },
      { label: "Notifications", to: "/coordinator/notifications", icon: Bell, showsUnread: true },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Settings", to: "/coordinator/settings", icon: Settings },
      { label: "Accessibility", to: "/coordinator/accessibility", icon: Accessibility },
    ],
  },
];

const volunteerGroups: NavGroup[] = [
  {
    label: "Explore",
    items: [
      { label: "Home", to: "/volunteer/home", icon: Home },
      { label: "Ask CivicFlow", to: "/ask", icon: MessageCircleQuestion },
      { label: "Discover", to: "/volunteer/discover", icon: Compass },
      { label: "My Schedule", to: "/volunteer/schedule", icon: CalendarDays },
      { label: "My Hours", to: "/volunteer/hours", icon: Clock3 },
      { label: "My Impact", to: "/volunteer/impact", icon: HeartHandshake },
      { label: "Verification", to: "/volunteer/verification", icon: FileCheck2 },
      { label: "Saved", to: "/volunteer/saved", icon: Bookmark },
      { label: "Profile", to: "/volunteer/profile", icon: UserRound },
      { label: "Notifications", to: "/volunteer/notifications", icon: Bell, showsUnread: true },
    ],
  },
];

interface SidebarProps {
  role: ShellRole;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onDismissMobile: () => void;
}

export function Sidebar({
  role,
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onDismissMobile,
}: SidebarProps) {
  const isCoordinator = role === "coordinator";
  const groups = isCoordinator ? coordinatorGroups : volunteerGroups;
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { workspace, session } = useWorkspace();
  const organizationWorkspace = useOrganizationWorkspace(user);
  const currentOrganization = organizationWorkspace.current;
  const organizationName = currentOrganization?.name ?? "No workspace yet";
  const organizationInitials = initialsOf(organizationName);
  const volunteer = workspace.volunteers.find((row) => row.id === user?.volunteerId);
  const personName =
    user?.name ?? (isCoordinator ? "Praket Gauri" : (volunteer?.name ?? "Volunteer"));
  const person = {
    name: personName,
    initials: initialsOf(personName),
    tone: isCoordinator ? "teal" : (volunteer?.tone ?? "cobalt"),
    role: isCoordinator ? t("Coordinator") : t("Volunteer"),
    photo: isCoordinator ? undefined : (volunteer?.photo ?? session.volunteerProfile.photo),
  };
  const { data: notifications = [] } = useNotifications(
    user?.role ?? (role === "volunteer" ? "volunteer" : "coordinator"),
  );
  const unread =
    notifications.filter((notification) => !notification.readAt).length +
    organizationWorkspace.unread;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!workspaceOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!workspaceRef.current?.contains(event.target as Node)) setWorkspaceOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkspaceOpen(false);
        workspaceTriggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [workspaceOpen]);

  function dismissOnNavigate() {
    setWorkspaceOpen(false);
    onDismissMobile();
  }

  function switchWorkspace(organizationId: string) {
    if (!user) return;
    setCurrentOrganization(user.email, organizationId);
    dismissOnNavigate();
    navigate(isCoordinator ? "/coordinator/mission-control" : "/volunteer/home");
  }

  return (
    <>
      <div
        className={styles.mobileBackdrop}
        data-open={mobileOpen}
        aria-hidden="true"
        onClick={onDismissMobile}
      />
      <aside
        className={styles.sidebar}
        aria-label="Primary"
        data-mobile-open={mobileOpen}
        data-collapsed={collapsed}
        data-rail="true"
      >
        <div className={styles.brandRow}>
          <Link
            className={styles.brand}
            to={isCoordinator ? "/coordinator/mission-control" : "/volunteer/home"}
            onClick={dismissOnNavigate}
          >
            <span className={styles.mark} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M4.2 8.6c4.6-4.9 11.2-4.9 15.8-.9-4.7 4.6-11.2 4.8-15.8.9Z"
                  fill="#f8f1e3"
                />
                <path
                  d="M4.4 15.1c4.4-4.3 10.6-4.4 15.2-.7-4.6 4.4-10.8 4.6-15.2.7Z"
                  fill="#f8f1e3"
                  opacity="0.6"
                />
              </svg>
            </span>
            <span className={styles.brandName}>CivicFlow</span>
          </Link>
          {mobileOpen ? (
            <button
              type="button"
              className={styles.frameButton}
              onClick={onDismissMobile}
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              type="button"
              className={styles.frameButton}
              onClick={onToggleCollapsed}
              aria-label={t(collapsed ? "Pin navigation open" : "Collapse navigation")}
              aria-pressed={!collapsed}
              title={t(collapsed ? "Pin navigation open" : "Collapse navigation")}
            >
              {collapsed ? <Pin size={15} /> : <PanelLeftClose size={16} />}
            </button>
          )}
        </div>

        <div className={styles.workspace} ref={workspaceRef}>
          <button
            ref={workspaceTriggerRef}
            type="button"
            className={styles.orgSwitcher}
            aria-label={`${t("Workspace")}: ${organizationName}. ${t("Open workspace menu")}`}
            aria-haspopup="menu"
            aria-expanded={workspaceOpen}
            onClick={() => setWorkspaceOpen((open) => !open)}
          >
            <span className={styles.orgBadge} aria-hidden="true">
              {organizationInitials}
            </span>
            <span className={styles.orgText}>
              <span className={styles.orgName}>{organizationName}</span>
              <span className={styles.orgMeta}>
                {currentOrganization
                  ? `${currentOrganization.city}, ${currentOrganization.state}`
                  : "No workspace yet"}
              </span>
            </span>
            <ChevronDown className={styles.chevron} size={12} aria-hidden="true" />
          </button>

          {workspaceOpen ? (
            <div className={styles.workspaceMenu} role="menu" aria-label="Workspace">
              <span className={styles.menuLabel} role="presentation">
                {t("Workspaces")}
              </span>
              {organizationWorkspace.organizations.length === 0 ? (
                <p className={styles.menuEmpty} role="none">
                  Join or create an organization to start scheduling.
                </p>
              ) : (
                organizationWorkspace.organizations.map(({ organization }) => {
                  const active = currentOrganization?.id === organization.id;
                  return (
                    <button
                      key={organization.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={styles.menuWorkspace}
                      data-active={active}
                      onClick={() => switchWorkspace(organization.id)}
                    >
                      <span className={styles.orgBadge} aria-hidden="true">
                        {initialsOf(organization.name)}
                      </span>
                      <span className={styles.menuCurrentText}>
                        <span className={styles.menuCurrentName}>{organization.name}</span>
                        <span className={styles.menuCurrentMeta}>
                          {organization.city}, {organization.state}
                        </span>
                      </span>
                      {active ? <Check size={14} aria-hidden="true" /> : null}
                    </button>
                  );
                })
              )}
              <div className={styles.menuDivider} role="separator" />
              <Link
                to={isCoordinator ? "/coordinator/start" : "/volunteer/start"}
                className={styles.menuItem}
                role="menuitem"
                onClick={dismissOnNavigate}
              >
                {isCoordinator ? "Join another organization" : "Discover organizations"}
              </Link>
              {isCoordinator ? (
                <Link
                  to="/coordinator/organization/new"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={dismissOnNavigate}
                >
                  Create an organization
                </Link>
              ) : null}
              <div className={styles.menuDivider} role="separator" />
              {isCoordinator ? (
                <>
                  <Link
                    to="/coordinator/settings"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={dismissOnNavigate}
                  >
                    Workspace settings
                  </Link>
                  <Link
                    to="/coordinator/backup"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={dismissOnNavigate}
                  >
                    Backups &amp; recovery
                  </Link>
                </>
              ) : (
                <Link
                  to="/help"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={dismissOnNavigate}
                >
                  Help
                </Link>
              )}
              <Link
                to="/credits"
                className={styles.menuItem}
                role="menuitem"
                onClick={dismissOnNavigate}
              >
                Photo credits
              </Link>
            </div>
          ) : null}
        </div>

        <nav className={styles.nav}>
          {groups.map((group) => (
            <div key={group.label} className={styles.group}>
              <h2 className={styles.groupLabel}>{t(group.label)}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        [
                          styles.item,
                          item.accent ? styles.itemAccent : "",
                          isActive ? styles.itemActive : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                      title={t(item.label)}
                      onClick={dismissOnNavigate}
                    >
                      <item.icon size={16.5} strokeWidth={1.7} aria-hidden="true" />
                      <span className={styles.itemLabel}>{t(item.label)}</span>
                      {item.showsUnread && unread > 0 ? (
                        <span className={styles.badge} aria-label={`${unread} ${t("unread")}`}>
                          {unread}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {!isCoordinator ? (
            <div className={styles.group}>
              <h2 className={styles.groupLabel}>{t("Support")}</h2>
              <ul>
                <li>
                  <Link
                    className={styles.item}
                    to="/coordinator/accessibility"
                    title="Accessibility"
                    onClick={dismissOnNavigate}
                  >
                    <Accessibility size={16.5} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.itemLabel}>Accessibility</span>
                  </Link>
                </li>
                <li>
                  <Link
                    className={styles.item}
                    to="/coordinator/settings"
                    title="Settings"
                    onClick={dismissOnNavigate}
                  >
                    <Settings size={16.5} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.itemLabel}>Settings</span>
                  </Link>
                </li>
                <li>
                  <Link
                    className={styles.item}
                    to="/credits"
                    title="Photo credits"
                    onClick={dismissOnNavigate}
                  >
                    <FolderOpen size={16.5} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.itemLabel}>Photo credits</span>
                  </Link>
                </li>
                <li>
                  <Link className={styles.item} to="/help" title="Help" onClick={dismissOnNavigate}>
                    <HelpCircle size={16.5} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.itemLabel}>Help</span>
                  </Link>
                </li>
              </ul>
            </div>
          ) : (
            <div className={styles.group}>
              <h2 className={styles.groupLabel}>{t("About")}</h2>
              <ul>
                <li>
                  <Link
                    className={styles.item}
                    to="/credits"
                    title="Photo credits"
                    onClick={dismissOnNavigate}
                  >
                    <FolderOpen size={16.5} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.itemLabel}>Photo credits</span>
                  </Link>
                </li>
                <li>
                  <Link className={styles.item} to="/help" title="Help" onClick={dismissOnNavigate}>
                    <HelpCircle size={16.5} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.itemLabel}>Help</span>
                  </Link>
                </li>
              </ul>
            </div>
          )}
        </nav>

        <div className={styles.footer}>
          <div className={styles.person}>
            <Avatar
              initials={person.initials}
              src={person.photo || undefined}
              tone={person.tone}
              size={36}
            />
            <span className={styles.personText}>
              <span className={styles.personName}>{person.name}</span>
              <span className={styles.personRole}>{person.role}</span>
            </span>
          </div>
          <div className={styles.footerActions}>
            <div className={styles.status}>
              <span className={styles.onlineDot} aria-hidden="true" />
              <span>Online</span>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              <span>Saved locally</span>
            </div>
            <button
              type="button"
              className={styles.signOut}
              onClick={() => void signOut()}
              aria-label={t("Sign out")}
              title={t("Sign out")}
            >
              <LogOut size={14} aria-hidden="true" />
              <span className={styles.itemLabel}>{t("Sign out")}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
