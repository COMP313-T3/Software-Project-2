# Sprint 2 Goal and Backlog

## Sprint 2 Goal

For Sprint 2, our main goal was to continue the work from Sprint 1 and focus more on the actual competition experience in TopSend.

Sprint 1 was mainly about setting up the main parts of the system, such as login, competition creation, routes, divisions, competition discovery, and event registration.

For Sprint 2, we focused more on what happens during and after a competition. This included result entry, live leaderboards, scorecards, route statistics, competition history, and AI features.

We also worked on more Admin features, mobile improvements, live updates, the Visitor Landing Page, and some extra UI improvements such as the onboarding tips.

---

## Sprint 2 Main Features

During Sprint 2, we mainly worked on:

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

Sprint 1 focused more on setting up competitions and allowing Climbers to discover and register for events.

Sprint 2 focused more on the actual competition, including scoring, scorecards, rankings, results, statistics, and AI assistance.

---

## Sprint 2 Backlog

The following User Stories were selected for Iteration 2.

| **User Story** | **Title** | **Priority** | **Assigned Team Member(s)** | **Expected Completion** | **Final Status** |
| --- | --- | --- | --- | --- | --- |
| US-007 | Administrator Details | Medium | RUISHENG & JOSEPH | Sprint 2 | Done |
| US-008 | Manage Users | Low | BRIAN & JOSEPH | Sprint 2 | Done |
| US-009 | User Details | Low | BRIAN & RICHARD | Sprint 2 | Done |
| US-010 | System Configuration and Advanced Settings | Low | RICHARD & RUISHENG | Sprint 2 | Done |
| US-019 | Result Entry | High | JOSEPH & BRIAN | Sprint 2 | Done |
| US-020 | Live Leaderboard and Displays | High | BRIAN & JOSEPH | Sprint 2 | Done |
| US-021 | Display Customization | Medium | RICHARD & RUISHENG | Sprint 2 | Done |
| US-022 | Route Statistics | High | RICHARD & RUISHENG | Sprint 2 | Done |
| US-023 | Gym Admin AI Route Assistant | Medium | BRIAN & JOSEPH | Sprint 2 | Done |
| US-024 | Competition History | Medium | RICHARD & RUISHENG | Sprint 2 | Done |
| US-030 | My Events | Medium | RICHARD & RUISHENG | Sprint 2 | Done |
| US-031 | My Scorecard | High | GABRIEL & JOSEPH | Sprint 2 | Done |
| US-032 | Ranking and Leaderboard | High | GABRIEL | Sprint 2 | Done |
| US-033 | Climber AI Route Assistant | High | GABRIEL | Sprint 2 | Done |
| US-036 | Visitor Landing Page | Low | GABRIEL | Sprint 2 | Done |

A total of **15 User Stories** were included in Sprint 2.

The onboarding tips were also worked on during Sprint 2, but we did not count them as a separate User Story because they are more of a UI and user experience improvement.

---

## Sprint 2 Feature Development

### System Administration

For Sprint 2, we continued working on more System Administrator features.

This included:

- Administrator Details
- Manage Users
- User Details
- System Configuration and Advanced Settings

The Admin can view users, search and filter accounts, update allowed information, manage available permissions, deactivate accounts, and update system settings.

These features give the System Administrator more control over TopSend and its registered users.

---

### Result Entry

The Result Entry feature allows the Gym Administrator to record official competition results for Climbers.

The Gym Admin can:

- Select a registered Climber
- Select a boulder problem
- Record attempts
- Record a successful send
- Record a flash when supported
- Save the official result

After the result is saved, TopSend calculates the score using the scoring rules for that competition.

AI features cannot create or modify official results.

---

### Live Leaderboard and Displays

The Live Leaderboard shows the current competition standings based on official competition results.

For this feature, we worked on:

- Showing the current rankings
- Updating rankings when official results are saved
- Showing standings by division
- Allowing Climbers to view the leaderboard after the competition starts
- Live updates without needing to refresh manually
- Reconnect options if the live connection stops
- Mobile leaderboard improvements

The Gym Admin can choose which division they want to view.

Climbers automatically see the standings for their own division.

---

### Display Customization

Gym Administrators can customize the competition display.

Some of the available options include:

- Competition background

The saved customization only applies to the selected competition.

---

### Route Statistics

The Route Statistics feature shows information about how Climbers performed on each route.

Some of the statistics include:

- Completion rate
- Average attempts
- Flash rate

The statistics are calculated using official competition results.

Each route keeps its own statistics, and these statistics do not automatically change the official V-grade of the route.

---

### Gym Admin AI Route Assistant

The Gym Admin AI Route Assistant helps the Gym Administrator understand route performance and competition statistics.

The AI can use information such as:

- V-grade
- Completion rate
- Average attempts
- Flash rate
- Competition results

The Gym Admin can ask the AI to compare routes or explain the available route statistics.

The AI only gives explanations and suggestions.

It cannot change:

- Official scores
- Official results
- Route grades
- Rankings
- Competition winners

The chatbot also knows which competition and page the Gym Admin is currently viewing.

---

### Competition History

Competition History allows the Gym Administrator to look back at previous competitions from their assigned gym.

The Gym Admin can:

- View previous competitions
- Open a previous competition
- Review previous results
- Review route statistics

The competition history stays connected to the correct gym and competition.

---

### My Events

The My Events feature allows Climbers to easily access competitions they registered for.

Before the competition starts, My Events can show:

- Competition information
- Start time
- Countdown to the start
- Registration status

When the competition starts, the Climber can access:

- My Scorecard
- Live Leaderboard

During the competition, a countdown shows how much time is left before scoring closes.

The system also gives warnings 15 minutes and 5 minutes before the competition ends.

After the competition ends, the Climber can view the final leaderboard.

---

### My Scorecard

My Scorecard was one of the main Climber features we worked on during Sprint 2.

The scorecard allows the Climber to:

- View competition boulder problems
- See completed and unfinished problems
- Record attempts
- Record successful sends
- View their points
- Correct the most recent attempt
- Move between scorecard pages
- Use filters
- Print the scorecard

The scorecard also updates live while the competition is running.

---

### Scorecard Attempt Tracking Improvement

One of the things we discussed during Sprint 2 was how Climbers should record attempts on the scorecard.

At first, the scorecard had an Add Attempt type of button.

We decided that using separate attempt circles would make more sense.

For example, if the competition allows five attempts:

`○ ○ ○ ○ ○`

The Climber can mark the circles depending on how many attempts they already used.

We thought this would work better because a Climber might try one route a few times, stop, go to another route, and then come back to the first route later.

With the circles, they can easily see how many attempts they already used.

The scorecard also shows the difference between:

- Failed attempts
- Successful send
- Unused attempts

The Climber can also remove the latest attempt if they marked it by mistake.

This made the scorecard easier to use during the competition.

---

### Scorecard Mobile Improvements

We also worked on making the scorecard easier to use on a phone.

On smaller screens:

- Competition details can be folded
- Climber totals can be folded
- Scorecard details can be folded
- Attempt circles are easier to tap
- More screen space is available for the routes

On larger screens, these sections stay visible because there is more space available.

---

### Ranking and Leaderboard

The Ranking and Leaderboard feature allows Climbers to see where they currently rank in the competition.

The leaderboard:

- Shows current competition rankings
- Uses official competition scores
- Shows the logged-in Climber's current position
- Shows the Climber's own division
- Updates live when official results change
- Does not require a manual refresh

Before the competition starts, the Climber sees a countdown.

During the competition, the leaderboard shows how much time is left and gives warnings before scoring closes.

After the competition ends, the final leaderboard shows the final standings.

---

### Climber AI Route Assistant

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

The AI can explain the current point difference but cannot guarantee a final placement.

The AI also cannot change:

- Official results
- Route grades
- Rankings
- Competition winners

It also cannot reveal another user's private information, passwords, tokens, API keys, or other protected information.

---

### Visitor Landing Page - US-036

US-036 is the Visitor Landing Page.

Visitors can open this page without logging in.

The page:

- Explains what TopSend is
- Shows the main features
- Shows available services
- Provides Log in and Sign up options
- Links to public features
- Works on desktop and mobile
- Uses the same overall TopSend design

This gives new users an idea of what TopSend does before they create an account.

---

### Onboarding Tips UI Improvement

We also worked on onboarding tips for new users.

This is **not a separate User Story**. We treated it as an extra UI and user experience improvement.

The onboarding tips can help:

- System Administrators
- Gym Administrators
- Climbers

When a user logs in for the first time, the onboarding can give them a short guide showing some of the main features for their role.

Users can:

- Go to the next step
- Go back to the previous step
- Skip the tutorial
- Open it again later using Onboarding Tips

Once the user finishes or skips it, TopSend can remember that it has already been shown.

For Climbers, the onboarding can also explain how the attempt circles on My Scorecard work.

We added this mainly to make the system easier to understand for someone using TopSend for the first time.

Again, this is treated as a **UI improvement and not US-037**.

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

We also made different UI improvements during Sprint 2.

Some of the changes include:

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

These changes were mainly made to make TopSend easier to use during an actual competition.

---

## Testing Progress

For our current testing, we are using the acceptance criteria and test cases to check if each feature is working correctly.

We are checking things like:

- If pages open correctly
- If the correct information is shown
- If valid actions work
- If invalid actions are blocked
- If users can only access features for their role
- If live updates work
- If mobile layouts work properly
- If competition timing works
- If the AI follows its restrictions

If we find an issue, we fix it and test the feature again.

---

## Debugging and Retesting

During Iteration 2, we also continued fixing bugs and checking the features again after making changes.

Our basic process is:

1. Find the issue.
2. Check what is causing it.
3. Make the needed change.
4. Test the feature again.
5. Check that the change did not break another part of the system.

We are still doing this as part of the Iteration 2 work before the final submission.

---

## Task Breakdown and Assignments

Each User Story was divided into smaller frontend, backend, integration, UI, and testing tasks when needed.

We used GitHub Issues and the GitHub Project board to keep track of the work.

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

The main developers working on the Sprint 2 User Stories are:

- Gabriel
- Brian
- Richard
- Ruisheng
- Joseph

We also used separate branches, commits, and Pull Requests to keep track of our individual work.

---

## Sprint 2 Progress Tracking

We continued using our GitHub Project board to track our Sprint 2 progress.

The main statuses are:

- Ready
- In Progress
- Done

When a task is completed and reviewed, it can be moved to Done.

We also use GitHub Issues to track the User Stories and their related tasks.

### GitHub Project

[TopSend Sprint Backlog / Kanban Board](https://github.com/orgs/COMP313-T3/projects/1)

---

## Development Workflow

For Sprint 2, we continued using branches and Pull Requests.

Our general workflow is:

`Feature/Fix Branch -> Pull Request -> dev`

and then:

`dev -> Release Branch -> main`

Each team member works on their assigned feature using a separate branch.

Once the work is ready, a Pull Request is created and reviewed before being merged into `dev`.

The release branch gives us another place to test everything together before merging the stable version into `main`.

---

## Progress Meeting

Our Iteration 2 progress meeting is on **November 20**.

During the meeting, we will go over our current project progress and the User Stories we have been working on.

The professor may also ask us to quickly demo specific User Stories or test cases from our acceptance criteria.

The progress report is for the **November 22 submission**.

This is not yet the final Iteration 2 submission.

---

## Next Steps

After the progress meeting and November 22 progress submission, we will continue working on Iteration 2.

Our next steps are:

- Finish any remaining features
- Fix bugs that we find
- Continue checking the acceptance criteria
- Continue testing the User Stories
- Check frontend and backend integration
- Check mobile layouts
- Test the AI features
- Update documentation
- Prepare the project for the final submission

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
