# Screen map — 49 registered routes

Every route below resolves to a real screen. The first 42 follow the design set this build
started from; eight more cover accounts, password recovery, the hosted email link, and the
Ask CivicFlow question box.

All paths are registered in `src/app/routes.ts`; mounting lives in `src/app/router.tsx`.
“Shell” means the coordinator or volunteer navigation frame; “standalone” renders its own
canvas.

| #   | Route                                                    | Screen                  | Frame             |
| --- | -------------------------------------------------------- | ----------------------- | ----------------- |
| 01  | `/coordinator/mission-control`                           | Mission Control         | coordinator shell |
| 02  | `/coordinator/autoroster`                                | AutoRoster              | coordinator shell |
| 03  | `/coordinator/impact`                                    | Impact Analytics        | coordinator shell |
| 04  | `/volunteer/discover`                                    | Discover                | volunteer shell   |
| 05  | `/volunteer/opportunities/:slug`                         | Opportunity Detail      | volunteer shell   |
| 06  | `/volunteer/schedule`                                    | My Schedule             | volunteer shell   |
| 07  | `/volunteer/profile`                                     | Volunteer Profile       | volunteer shell   |
| 08  | `/volunteer/check-in`                                    | Check In                | volunteer shell   |
| 09  | `/coordinator/reports`                                   | Reports                 | coordinator shell |
| 10  | `/coordinator/opportunities/new`                         | Create Opportunity      | coordinator shell |
| 11  | `/coordinator/schedule`                                  | Schedule                | coordinator shell |
| 12  | `/volunteer/hours`                                       | My Hours                | volunteer shell   |
| 13  | `/volunteer/impact`                                      | Personal Impact         | volunteer shell   |
| 14  | `/volunteer/verification`                                | Service Verification    | volunteer shell   |
| 15  | `/volunteer/shifts/:id`                                  | Volunteer Shift Detail  | volunteer shell   |
| 16  | `/volunteer/saved`                                       | Saved Opportunities     | volunteer shell   |
| 17  | `/volunteer/home`                                        | Volunteer Home          | volunteer shell   |
| 18  | `/volunteer/notifications`, `/coordinator/notifications` | Notifications           | shell             |
| 19  | `/coordinator/coverage`                                  | Coverage Command Center | coordinator shell |
| 20  | `/coordinator/opportunities`                             | Opportunities           | coordinator shell |
| 21  | `/coordinator/opportunities/:id`                         | Opportunity Management  | coordinator shell |
| 22  | `/coordinator/shifts/:id`                                | Live Roster             | coordinator shell |
| 23  | `/launch`                                                | Launch                  | standalone        |
| 24  | `/welcome`                                               | Welcome                 | standalone        |
| 25  | `/sign-in`                                               | Sign In                 | standalone        |
| 26  | `/volunteer/onboarding`                                  | Onboarding              | standalone        |
| 27  | `/coordinator/volunteers`                                | Volunteers              | coordinator shell |
| 28  | `/coordinator/volunteers/:id`                            | Volunteer Detail        | coordinator shell |
| 29  | `/coordinator/applications`                              | Recruitment Pipeline    | coordinator shell |
| 30  | `/coordinator/credentials`                               | Credentials & Skills    | coordinator shell |
| 31  | `/coordinator/attendance`                                | Live Attendance         | coordinator shell |
| 32  | `/coordinator/kiosk`                                     | Check-In Kiosk          | standalone        |
| 33  | `/coordinator/hours`                                     | Hours Review            | coordinator shell |
| 34  | `/coordinator/reports/custom`                            | Custom Report Builder   | coordinator shell |
| 35  | `/coordinator/insights`                                  | Retention & Engagement  | coordinator shell |
| 36  | `/coordinator/reports/preview`                           | Impact Report Preview   | coordinator shell |
| 37  | `/coordinator/records`                                   | Records                 | coordinator shell |
| 38  | `/coordinator/audit`                                     | Audit Log               | coordinator shell |
| 39  | `/coordinator/backup`                                    | Backup & Recovery       | coordinator shell |
| 40  | `/coordinator/settings`                                  | Settings                | coordinator shell |
| 41  | `/coordinator/accessibility`                             | Accessibility           | coordinator shell |
| 42  | `/create-account`                                        | Create Account          | standalone        |
| 43  | `/coordinator/start`                                     | Coordinator Onboarding  | standalone        |
| 44  | `/coordinator/organization/new`                          | Create Organization     | standalone        |
| 45  | `/volunteer/start`                                       | Find an Organization    | standalone        |
| 46  | `/forgot-password`                                       | Forgot Password         | standalone        |
| 47  | `/reset-password`                                        | Reset Password          | standalone        |
| 48  | `/auth/callback`                                         | Email Link              | standalone        |
| 49  | `/ask`                                                   | Ask CivicFlow           | both shells       |

## Notes

- Route 18 serves both shells; copy and feeds change with the path.
- Routes 07 and 29 are different surfaces: 07 is the volunteer’s own profile, 29 is the
  coordinator’s view of a volunteer.
- The kiosk is public by design but is not granted extra Tauri capabilities; it uses the same
  welcome-scoped workflow snapshot and no privileged APIs.
- Route 43 is self-serve account creation; it wears the sign-in card so the two account
  surfaces stay identical.
- Routes 44–46 continue that account path: coordinators join a team with a 10-digit code or
  create a workspace, volunteers discover public organizations or join with a 6-digit code.
- Route 49 renders in both shells. The question box filters its suggestions by role, and the
  coordinator-only questions are absent from a volunteer session.
