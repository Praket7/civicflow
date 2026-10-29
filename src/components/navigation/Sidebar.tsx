import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  Home,
  LogOut,
  PanelLeftClose,
  Pin,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import type { ShellRole } from "../../app/routes";
import { useAuth } from "../../lib/auth/session";
import { t } from "../../lib/i18n";
import { initialsOf } from "../../lib/initials";
import { selectOrganization } from "../../lib/organizations/store";
import { useOrganizationWorkspace } from "../../lib/organizations/useOrganizationWorkspace";
import { useWorkspace } from "../../lib/workspace/session";
import { Avatar } from "../ui/Avatar";
import styles from "./Sidebar.module.css";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Extra paths that belong to this work area. */
  also?: string[];
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
      { label: "Home", to: "/coordinator/mission-control", icon: Home },
      { label: "AutoRoster", to: "/coordinator/autoroster", icon: Sparkles, accent: true },
      { label: "Schedule", to: "/coordinator/schedule", icon: CalendarDays },
      { label: "Opportunities", to: "/coordinator/opportunities", icon: BriefcaseBusiness },
      {
        label: "People",
        to: "/coordinator/volunteers",
        icon: Users,
        also: [
          "/coordinator/applications",
          "/coordinator/credentials",
          "/coordinator/hours",
          "/coordinator/records",
        ],
      },
      {
        label: "Reports",
        to: "/coordinator/reports",
        icon: BarChart3,
        also: ["/coordinator/impact", "/coordinator/insights", "/coordinator/reports/custom"],
      },
    ],
  },
];

const volunteerGroups: NavGroup[] = [
  {
    label: "Volunteer",
    items: [
      { label: "Home", to: "/volunteer/home", icon: Home },
      { label: "Discover", to: "/volunteer/discover", icon: Compass, also: ["/volunteer/saved"] },
      { label: "Schedule", to: "/volunteer/schedule", icon: CalendarDays },
      {
        label: "Hours & Impact",
        to: "/volunteer/hours",
        icon: Clock3,
        also: ["/volunteer/impact", "/volunteer/verification"],
      },
      { label: "Profile", to: "/volunteer/profile", icon: UserRound },
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
  const location = useLocation();
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
    void selectOrganization(user, organizationId).then(() => {
      navigate(isCoordinator ? "/coordinator/mission-control" : "/volunteer/home");
    });
    dismissOnNavigate();
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
                    to="/coordinator/access"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={dismissOnNavigate}
                  >
                    Organization &amp; access
                  </Link>
                  <Link
                    to="/coordinator/settings"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={dismissOnNavigate}
                  >
                    Workspace settings
                  </Link>
                  <Link
                    to="/coordinator/audit"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={dismissOnNavigate}
                  >
                    Audit log
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
              ) : null}
              <Link
                to={isCoordinator ? "/coordinator/accessibility" : "/volunteer/profile"}
                className={styles.menuItem}
                role="menuitem"
                onClick={dismissOnNavigate}
              >
                Accessibility
              </Link>
              <Link
                to="/help"
                className={styles.menuItem}
                role="menuitem"
                onClick={dismissOnNavigate}
              >
                Help
              </Link>
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
                          isActive || item.also?.some((path) => location.pathname.startsWith(path))
                            ? styles.itemActive
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                      title={t(item.label)}
                      aria-current={
                        location.pathname === item.to ||
                        item.also?.some((path) => location.pathname.startsWith(path))
                          ? "page"
                          : undefined
                      }
                      onClick={dismissOnNavigate}
                    >
                      <item.icon size={16.5} strokeWidth={1.7} aria-hidden="true" />
                      <span className={styles.itemLabel}>{t(item.label)}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
              <span>Local workspace</span>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              <span>Saved on this device</span>
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
