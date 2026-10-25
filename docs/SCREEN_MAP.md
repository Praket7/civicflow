# Screen map — 42 references to 50 registered routes

The 42 design references map onto 42 screens; eight more routes cover accounts, password
recovery, the hosted email link, and the Ask CivicFlow question box.

All paths are registered in `src/app/routes.ts`; mounting lives in `src/app/router.tsx`.
“Shell” means the coordinator or volunteer navigation frame; “standalone” renders its own
canvas.

| #   | Reference                                   | Route                                                    | Screen                  | Frame             |
| --- | ------------------------------------------- | -------------------------------------------------------- | ----------------------- | ----------------- |
| 01  | `01_mission_control.png`                    | `/coordinator/mission-control`                           | Mission Control         | coordinator shell |
| 02  | `02_autoroster.png`                         | `/coordinator/autoroster`                                | AutoRoster              | coordinator shell |
| 03  | `03_impact_analytics.png`                   | `/coordinator/impact`                                    | Impact Analytics        | coordinator shell |
| 04  | `04_discover_opportunities.png`             | `/volunteer/discover`                                    | Discover                | volunteer shell   |
| 05  | `05_opportunity_detail.png`                 | `/volunteer/opportunities/:slug`                         | Opportunity Detail      | volunteer shell   |
| 06  | `06_my_schedule.png`                        | `/volunteer/schedule`                                    | My Schedule             | volunteer shell   |
| 07  | `07_volunteer_profile.png`                  | `/volunteer/profile`                                     | Volunteer Profile       | volunteer shell   |
| 08  | `08_check_in.png`                           | `/volunteer/check-in`                                    | Check In                | volunteer shell   |
| 09  | `09_reports_hub.png`                        | `/coordinator/reports`                                   | Reports                 | coordinator shell |
| 10  | `10_create_opportunity.png`                 | `/coordinator/opportunities/new`                         | Create Opportunity      | coordinator shell |
| 11  | `11_schedule.png`                           | `/coordinator/schedule`                                  | Schedule                | coordinator shell |
| 12  | `12_my_hours.png`                           | `/volunteer/hours`                                       | My Hours                | volunteer shell   |
| 13  | `13_personal_impact.png`                    | `/volunteer/impact`                                      | Personal Impact         | volunteer shell   |
| 14  | `14_service_verification.png`               | `/volunteer/verification`                                | Service Verification    | volunteer shell   |
| 15  | `15_volunteer_shift_detail.png`             | `/volunteer/shifts/:id`                                  | Volunteer Shift Detail  | volunteer shell   |
| 16  | `16_saved_opportunities.png`                | `/volunteer/saved`                                       | Saved Opportunities     | volunteer shell   |
| 17  | `17_volunteer_home.png`                     | `/volunteer/home`                                        | Volunteer Home          | volunteer shell   |
| 18  | `18_notifications.png`                      | `/volunteer/notifications`, `/coordinator/notifications` | Notifications           | shell             |
| 19  | `19_coverage_command_center.png`            | `/coordinator/coverage`                                  | Coverage Command Center | coordinator shell |
| 20  | `20_opportunities.png`                      | `/coordinator/opportunities`                             | Opportunities           | coordinator shell |
| 21  | `21_opportunity_management.png`             | `/coordinator/opportunities/:id`                         | Opportunity Management  | coordinator shell |
| 22  | `22_shift_detail_live_roster.png`           | `/coordinator/shifts/:id`                                | Live Roster             | coordinator shell |
| 23  | `23_launch_screen.png`                      | `/launch`                                                | Launch                  | standalone        |
| 24  | `24_welcome.png`                            | `/welcome`                                               | Welcome                 | standalone        |
| 25  | `25_sign_in.png`                            | `/sign-in`                                               | Sign In                 | standalone        |
| 26  | `26_volunteer_onboarding.png`               | `/volunteer/onboarding`                                  | Onboarding              | standalone        |
| 27  | `27_organization_setup.png`                 | `/coordinator/organization/setup`                        | Organization Setup      | standalone        |
| 28  | `28_volunteers.png`                         | `/coordinator/volunteers`                                | Volunteers              | coordinator shell |
| 29  | `29_volunteer_detail.png`                   | `/coordinator/volunteers/:id`                            | Volunteer Detail        | coordinator shell |
| 30  | `30_recruitment_pipeline.png`               | `/coordinator/applications`                              | Recruitment Pipeline    | coordinator shell |
| 31  | `31_credentials_skills.png`                 | `/coordinator/credentials`                               | Credentials & Skills    | coordinator shell |
| 32  | `32_attendance.png`                         | `/coordinator/attendance`                                | Live Attendance         | coordinator shell |
| 33  | `33_check_in_kiosk.png`                     | `/coordinator/kiosk`                                     | Check-In Kiosk          | standalone        |
| 34  | `34_hours_review.png`                       | `/coordinator/hours`                                     | Hours Review            | coordinator shell |
| 35  | `35_custom_report_builder.png`              | `/coordinator/reports/custom`                            | Custom Report Builder   | coordinator shell |
| 36  | `36_retention_engagement.png`               | `/coordinator/insights`                                  | Retention & Engagement  | coordinator shell |
| 37  | `37_organization_impact_report_preview.png` | `/coordinator/reports/preview`                           | Impact Report Preview   | coordinator shell |
| 38  | `38_records.png`                            | `/coordinator/records`                                   | Records                 | coordinator shell |
| 39  | `39_audit_log.png`                          | `/coordinator/audit`                                     | Audit Log               | coordinator shell |
| 40  | `40_backup_recovery.png`                    | `/coordinator/backup`                                    | Backup & Recovery       | coordinator shell |
| 41  | `41_settings.png`                           | `/coordinator/settings`                                  | Settings                | coordinator shell |
| 42  | `42_accessibility.png`                      | `/coordinator/accessibility`                             | Accessibility           | coordinator shell |
| 43  | — (added, no reference)                     | `/create-account`                                        | Create Account          | standalone        |
| 44  | — (added, no reference)                     | `/coordinator/start`                                     | Coordinator Onboarding  | standalone        |
| 45  | — (added, no reference)                     | `/coordinator/organization/new`                          | Create Organization     | standalone        |
| 46  | — (added, no reference)                     | `/volunteer/start`                                       | Find an Organization    | standalone        |
| 47  | — (added, no reference)                     | `/forgot-password`                                       | Forgot Password         | standalone        |
| 48  | — (added, no reference)                     | `/reset-password`                                        | Reset Password          | standalone        |
| 49  | — (added, no reference)                     | `/auth/callback`                                         | Email Link              | standalone        |
| 50  | — (added, no reference)                     | `/ask`                                                   | Ask CivicFlow           | both shells       |

## Notes

- Reference 18 serves both shells; copy and feeds change with the path.
- References 07 and 29 are different surfaces: 07 is the volunteer’s own profile, 29 is the
  coordinator’s view of a volunteer.
- The kiosk is public by design but is not granted extra Tauri capabilities; it uses the same
  welcome-scoped workflow snapshot and no privileged APIs.
- Reference images are design targets only. They are excluded from the app build.
- Route 43 is self-serve account creation; it wears the sign-in card so the two account
  surfaces stay identical.
- Routes 44–46 continue that account path: coordinators join a team with a 10-digit code or
  create a workspace, volunteers discover public organizations or join with a 6-digit code.
- Route 50 renders in both shells. The question box filters its suggestions by role, and the
  coordinator-only questions are absent from a volunteer session.
