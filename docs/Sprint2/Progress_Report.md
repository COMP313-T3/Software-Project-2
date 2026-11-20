# Iteration 2 Progress Report

## Iteration 2 Goal

For Iteration 2, our main goal is to continue the work we started in Iteration 1 and focus more on the actual competition experience in TopSend.

Iteration 1 was mainly focused on setting up the main foundation of the system, such as login, competition creation, routes, divisions, competition discovery, and registration.

For Iteration 2, we are focusing more on what happens during and after a competition. This includes result entry, scorecards, live leaderboards, route statistics, competition history, and the AI Route Assistant.

We are also continuing to work on more Admin features, mobile improvements, live updates, the Visitor Landing Page, and other UI improvements.

---

## Iteration 2 Main Features

For Iteration 2, we are mainly working on:

- Additional System Administrator features
- User management
- System configuration and settings
- Official result entry
- Live leaderboard and displays
- Display customization
- Route statistics
- Gym Admin AI Route Assistant
- Competition history
- My Events
- My Scorecard
- Ranking and Leaderboard
- Climber AI Route Assistant
- Visitor Landing Page
- Mobile UI improvements
- Live updates and reconnect handling
- Onboarding tips and other UI improvements

Sprint 1 focused more on creating and setting up competitions and allowing Climbers to discover and register for events.

Iteration 2 focuses more on what the users actually do while the competition is running, such as recording results, using the scorecard, checking rankings, and reviewing competition statistics.

---

## Iteration 2 User Stories

These are the User Stories included in our Iteration 2 work:

| **User Story** | **Title** | **Contributors** |
| --- | --- | --- |
| US-007 | Administrator Details | Ruisheng, Joseph |
| US-008 | Manage Users | Brian, Joseph |
| US-009 | User Details | Brian, Richard |
| US-010 | System Configuration and Advanced Settings | Richard, Ruisheng |
| US-019 | Result Entry | Joseph, Brian |
| US-020 | Live Leaderboard and Displays | Brian, Joseph |
| US-021 | Display Customization | Richard, Ruisheng |
| US-022 | Route Statistics | Richard, Ruisheng |
| US-023 | Gym Admin AI Route Assistant | Brian, Joseph |
| US-024 | Competition History | Richard, Ruisheng |
| US-030 | My Events | Richard, Ruisheng |
| US-031 | My Scorecard | Gabriel, Joseph |
| US-032 | Ranking and Leaderboard | Gabriel |
| US-033 | Climber AI Route Assistant | Gabriel |
| US-036 | Visitor Landing Page | Gabriel |

A total of **15 User Stories** are included in our Iteration 2 work.

The onboarding tips are not counted as another User Story. We are treating them as an extra UI and user experience improvement.

---

## Acceptance Criteria and Test Cases

For the Iteration 2 progress report, we reviewed the acceptance criteria for the User Stories and prepared test cases for them.

For each test, we used:

- **Test with inputs**
- **Expected outcome**

We did this so we can clearly check whether each part of the User Story is working correctly.

The test cases include different situations such as:

- Valid inputs
- Invalid inputs
- User roles and permissions
- Competition timing
- Live updates
- Mobile behaviour
- AI restrictions
- Error handling
- Expected system responses

This also helps us prepare for the progress meeting because the professor may ask us to demonstrate a specific User Story or test case.

---

## Current Iteration 2 Progress

For Iteration 2, we have been working on the remaining parts of TopSend that were not included in the first iteration.

Some of the main areas we have been working on are:

- Admin user management
- Result Entry
- Live Leaderboard
- Display Customization
- Route Statistics
- Competition History
- My Events
- My Scorecard
- Ranking and Leaderboard
- Gym Admin AI Route Assistant
- Climber AI Route Assistant
- Visitor Landing Page
- Mobile improvements
- Live updates
- UI changes
- Bug fixes

We are also reviewing the features using the acceptance criteria and making changes when something does not work the way we expected.

---

## System Administration

For Iteration 2, we continued working on more System Administrator features.

These include:

- Administrator Details
- Manage Users
- User Details
- System Configuration and Advanced Settings

The Admin can manage user information, search and filter users, change allowed permissions, deactivate accounts, and manage available system settings.

These features give the System Administrator more control over the users and the overall platform.

---

## Result Entry

The Result Entry feature allows the Gym Administrator to record official competition results.

The Gym Admin can:

- Select a registered Climber
- Select a boulder problem
- Record attempts
- Record a successful send
- Record a flash when supported
- Save the official result

After the result is saved, TopSend calculates the score using the scoring rules for that competition.

The AI cannot create or modify official competition results.

---

## Live Leaderboard and Displays

The Live Leaderboard shows the current standings of the competition using official competition results.

For this feature, we worked on:

- Showing current rankings
- Updating rankings when new official results are saved
- Showing standings by division
- Allowing Climbers to view the leaderboard once the competition starts
- Live updates without manually refreshing the page
- Reconnect options when the live connection stops
- Mobile leaderboard improvements

The Gym Admin can choose which division they want to view.

Climbers automatically see their own division.

---

## Display Customization

Gym Administrators can customize the competition display.

Some of the available options include:

- Competition background
- Gym or competition logo
- Sponsor images

The saved customization only applies to the selected competition.

---

## Route Statistics

The Route Statistics feature shows information about how Climbers performed on each route.

Some of the statistics include:

- Completion rate
- Average attempts
- Flash rate

The statistics are calculated using the official competition results.

Each route has its own statistics, and these statistics do not automatically change the official V-grade of the route.

---

## Gym Admin AI Route Assistant

The Gym Admin AI Route Assistant helps the Gym Administrator understand route performance and competition statistics.

The AI can use information such as:

- V-grade
- Completion rate
- Average attempts
- Flash rate
- Competition results

The Gym Admin can ask questions about the routes and compare different routes.

The AI is only used for explanations and suggestions.

It cannot change:

- Official scores
- Official results
- Route grades
- Rankings
- Competition winners

The chatbot also knows which competition and page the Gym Admin is currently using.

---

## Competition History

Competition History allows the Gym Administrator to review previous competitions from their assigned gym.

The Gym Admin can:

- View previous competitions
- Open a previous competition
- Review previous results
- Review route statistics

The competition history stays connected to the correct gym and competition.

---

## My Events

The My Events feature allows Climbers to quickly access competitions they registered for.

Before a competition starts, My Events can show:

- Competition information
- Start time
- Countdown to the start
- Registration status

When the competition starts, the Climber can access:

- My Scorecard
- Live Leaderboard

While the competition is running, a countdown shows how much time is left before scoring closes.

The system also gives warnings 15 minutes and 5 minutes before the competition ends.

After the competition ends, the Climber can view the final leaderboard.

---

## My Scorecard

My Scorecard is one of the main Climber features we worked on during Iteration 2.

The scorecard allows the Climber to:

- View the competition boulder problems
- See completed and unfinished problems
- Record attempts
- Record successful sends
- View their points
- Correct the latest attempt
- Move between scorecard pages
- Use filters
- Print the scorecard

The scorecard also updates live during the competition.

---

## Scorecard Attempt Tracking Improvement

One of the changes we discussed during Iteration 2 was how Climbers record their attempts.

Originally, the scorecard had an Add Attempt type of button.

We decided that separate attempt circles would make more sense.

For example, if the competition allows five attempts:

`○ ○ ○ ○ ○`

The Climber can mark how many attempts they already used.

We decided to do it this way because a Climber might try one route a few times, stop, move to another route, and then come back to the first route later.

The circles make it easier for them to see where they stopped.

The scorecard also shows the difference between:

- Failed attempts
- Successful send
- Unused attempts

The Climber can also remove the latest attempt if they marked it by mistake.

This made the scorecard easier to use during an actual competition.

---

## Scorecard Mobile Improvements

We also worked on making the scorecard easier to use on a phone.

On smaller screens:

- Competition details can be folded
- Climber totals can be folded
- Scorecard details can be folded
- Attempt circles are easier to tap
- More space is available for the routes

On larger screens, the information stays visible because there is more screen space.

---

## Ranking and Leaderboard

The Ranking and Leaderboard feature allows Climbers to see their current position in the competition.

The leaderboard:

- Shows the current rankings
- Uses official competition scores
- Shows the logged-in Climber's position
- Shows the Climber's own division
- Updates live when results change
- Does not need a manual refresh

Before the competition starts, the Climber sees a countdown.

During the competition, the leaderboard shows how much time is left.

After the competition ends, the final leaderboard shows the final standings.

---

## Climber AI Route Assistant

The Climber AI Route Assistant helps the Climber understand their competition progress and decide which route they may want to try next.

The AI can use:

- Competition statistics
- The Climber's recorded results
- Official standings
- Scoring information

The Climber can ask questions such as:

- Which unfinished route should I try next?
- Why should I try that route?
- How many points am I behind another ranking position?

The AI can explain the current point difference but cannot guarantee the final placement.

The AI also cannot change:

- Official results
- Route grades
- Rankings
- Competition winners

It also cannot reveal another user's private information, passwords, tokens, API keys, or other protected information.

---

## Visitor Landing Page - US-036

US-036 is the Visitor Landing Page.

Visitors can open the landing page without logging in.

The page:

- Explains what TopSend is
- Shows the main features
- Shows available services
- Provides Log in and Sign up options
- Works on desktop and mobile
- Uses the same overall TopSend design

This gives new users a better idea of what TopSend does before creating an account.

---

## Onboarding Tips

We also worked on onboarding tips as an extra UI improvement.

The onboarding tips are **not a separate User Story**.

They are mainly there to help new users understand where some of the important features are.

The onboarding can be used for:

- System Administrators
- Gym Administrators
- Climbers

When a user logs in for the first time, the onboarding can show a short guide based on their role.

Users can:

- Go to the next step
- Go back to the previous step
- Skip the guide
- Open it again later using Onboarding Tips

Once the user finishes or skips it, TopSend can remember that it has already been shown.

For Climbers, the onboarding can also explain how the attempt circles on My Scorecard work.

We are treating this as a UI and user experience improvement instead of creating another User Story for it.

---

## Competition Timing

We also worked on how TopSend behaves before, during, and after a competition.

Before the competition starts, the Climber sees a countdown.

When the competition starts, the scorecard and leaderboard become available.

While the competition is running, the system shows how much time is left.

Warnings are shown:

- 15 minutes before the competition ends
- 5 minutes before the competition ends

When the competition ends:

- Scoring closes
- Results become final
- The scorecard stops accepting results
- The Climber can view the final leaderboard

---

## Mobile and UI Improvements

We also made different UI improvements during Iteration 2.

Some of these include:

- Collapsible sections on mobile
- Easier scorecard controls
- Attempt circles instead of an Add Attempt button
- Better leaderboard layouts
- Competition countdowns
- Live updates
- Reconnect options
- Visitor Landing Page improvements
- Onboarding tips
- General UI cleanup

These changes are mainly to make TopSend easier to use during an actual competition.

---

## Testing Progress

For our current testing, we are using the acceptance criteria and test cases to check if each feature is working correctly.

We are checking things like:

- If pages open correctly
- If the correct information is shown
- If valid actions work
- If invalid actions are blocked
- If users only have access to the features for their role
- If live updates work
- If mobile layouts work properly
- If competition timing works
- If the AI follows its restrictions

If we find an issue, we fix it and test the feature again.

---

## Debugging and Retesting

During Iteration 2, we also continued fixing bugs and testing the features again after making changes.

Our basic process is:

1. Find the issue.
2. Check what is causing it.
3. Make the needed change.
4. Test the feature again.
5. Check that the change did not affect another part of the system.

We are still doing this as part of the current Iteration 2 work.

---

## Task Breakdown and Assignments

Each User Story was divided into smaller frontend, backend, integration, UI, and testing tasks when needed.

We used GitHub Issues and our GitHub Project board to keep track of the work.

Some of the tasks we worked on include:

- Building frontend pages and components
- Creating and updating backend APIs
- Connecting frontend and backend features
- Adding Result Entry
- Connecting results to the Live Leaderboard
- Adding live updates
- Building Route Statistics
- Adding AI Route Assistant features
- Improving mobile layouts
- Adding scorecard attempt circles
- Adding competition countdowns
- Checking user roles and permissions
- Fixing bugs
- Reviewing the UI
- Testing User Stories and acceptance criteria
- Updating project documentation

The main developers working on the Iteration 2 User Stories are:

- Gabriel
- Brian
- Richard
- Ruisheng
- Joseph

We also used separate branches, commits, and Pull Requests to keep track of our individual work.

---

## Iteration 2 Progress Tracking

We continued using our GitHub Project board to keep track of the Iteration 2 work.

The main statuses are:

- Ready
- In Progress
- Done

When a task is completed and reviewed, it can be moved to Done.

We also use GitHub Issues to keep track of each User Story and its related tasks.

### GitHub Project

[TopSend Sprint Backlog / Kanban Board](https://github.com/orgs/COMP313-T3/projects/3)

---

## Development Workflow

For Iteration 2, we continued using branches and Pull Requests.

Our general workflow is:

`Feature/Fix Branch -> Pull Request -> dev`

and then:

`dev -> Release Branch -> main`

Each team member works on their assigned feature using a separate branch.

Once the feature is ready, a Pull Request is created and reviewed before being merged into `dev`.

After the features are combined, we can test everything together before preparing the stable version for `main`.

---

## Next Steps

After the progress meeting and November 22 progress report, we will continue working on Iteration 2.

Our next steps include:

- Finish any remaining work
- Fix bugs that we find
- Continue testing the acceptance criteria
- Check frontend and backend integration
- Continue checking the AI features
- Update the documentation
- Prepare the final project files
- Possible to add for the complexity requirements for Sprint 2 submission on Nov 29

The final Iteration 2 submission is due on **November 29** and will include the GitHub Repository link, project code, and documentation.

---

## Related Documentation

More project information can be found in:

- `docs/User_Stories/User_Stories.md` — User Stories and Acceptance Criteria
- `docs/Requirements/requirements.md` — Project Requirements
- `docs/Mvp/mvp.md` — MVP Definition
- `docs/Project-Proposal/Project-Proposal.md` — Project Proposal
- `specs/specs.md` — Current Project Specification and Iteration Plan
- GitHub Issues — User Stories and development tasks
- GitHub Project — Sprint backlog and progress tracking
