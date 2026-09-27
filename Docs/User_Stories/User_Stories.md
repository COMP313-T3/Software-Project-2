# Project Proposal

**Project Name:** TopSend  
**Authors:** [Andrew, Gabriel, Joseph, Richard, Brian]

---

## Overview

Indoor climbing has continued to grow in Canada, and Toronto has an active climbing community with both established gyms and newer facilities. In 2025, Hogtown Boulders and Ethos Climbing were among the new Canadian climbing gyms that opened in Toronto. Across North America, the number of climbing gyms passed 900 facilities [1], [2].

Local climbing gyms often set up bouldering competitions and community events. Managing these events means keeping track of climbers climbing problems, attempts, scores, categories, registration and rankings. Existing products already offer many of these features. There remains a gap between big paid climbing platforms and simpler competition‑scoring tools. For example Griptonite offers competition‑management features while ClimbLive gives bouldering competition scoring and live results for free [3] [11].

TopSend is a competition platform created first for indoor climbing gyms in Toronto that host local bouldering competitions. The goal is to keep competition setup simple while giving competition discovery, registration, live scoring, customizable scoreboards and useful information from competition data.

A main feature of TopSend will be an AI Route Assistant that lets climbers and organizer ask questions like, "What is the easiest route?", "Which route should I try next?", "How many points do I need to reach a higher ranking?", or "Which route looks harder, than the grade originally set by the route setter?".

---

## Executive Summary

### Problem Statement

Climbing gyms that organize local competitions need a dependable system to set up events sign up climbers keep track of how many people can join, split participants into divisions, design boulder problems, log attempts, tally scores and display standings. Climbers also want a way to locate competitions know the event location register and watch their results while the competition takes place.

There are already systems that solve parts of this problem. Griptonite gives competition scoring, TV leaderboards, route management and other gym features. Vertical‑Life helps with competitions from events to professional formats. KAYA mixes competitions with route management and climber analytics. Other products such as BoulderScoring, SteepScores and ClimbLive focus more on scoring and live leaderboards [3]–[11].

This means TopSend cannot simply solve the problem by adding another leaderboard. Instead the project will focus on a specific gap. Some existing systems bring sets of gym‑management features while simpler tools mainly focus on entering scores and showing rankings. For a Toronto gym that mainly wants to run local bouldering competitions there may be room, for a focused system that keeps the competition workflow in one place while still giving useful analysis.

Another issue is that competition data is often gathered only to compute standings. Attempts, sends, flash rates, average attempts and completion percentages can also reveal how hard each problem felt to climbers. Climbing grades are subjective. Studies have shown that route difficulty can be assessed with climber performance and past ascent data [12]–[14].

TopSend will focus on local competition management and, on gaining a deeper understanding of the data already produced during the competition.

### Proposed Solution

TopSend will provide a responsive web application that lets a Toronto climbing gym create and run a local bouldering competition without needing a full gym‑management system.

TopSend will have three authenticated user roles:

- **System Administrator (ADMIN)**
- **Gym Administrator / Event Organizer (GYM_ADMIN)**
- **Climber (CLIMBER)**

TopSend will also support a public actor:

- **Visitor (VISITOR)**

A Visitor is someone who is using TopSend without being logged in. Visitors can access features create a Climber account or request Gym Administrator access.

All registered users will use one shared **Authentication subsystem**. After login, TopSend will identify the account role and provide access to the correct features.

A Visitor who wants to join competitions can create a Climber account directly. After creating the account the Visitor can log in as a CLIMBER. Creating a Climber account does not automatically register the CLIMBER for a competition.

The Gym Administrator onboarding process is different because TopSend must not allow anyone to give themselves access to a climbing gym.

A Visitor who represents a climbing gym can select **Register Your Gym** if their gym is not already registered on TopSend or **Request Gym Admin Access** if the gym already exists. The Visitor provides their contact information and the required gym information and submits the request.

The System Administrator reviews the request. If the request is approved, the gym is added when necessary and the user is connected to the correct gym. The approved user then receives an invitation to complete their Gym Administrator account setup and create a password.

After receiving access a Gym Administrator can create a competition add divisions create boulder problems assign route grades manage registered climbers set the maximum number of participants, open or close registration and choose the scoring format.

Climbers can find competitions through a List View or a Map View. The Map View will use the Google Maps API to show locations of gyms hosting competitions. Selecting an event from either view will let a Climber open the Event Details page see divisions and remaining spaces and register for the competition.

During the event authorized Gym Administrators will enter attempts and successful climbs. TopSend will calculate scores automatically. Update the leaderboard when official results are changed.

The system will also give scorecards and customizable leaderboard screens. A climbing gym could add its logo, competition background, sponsor images and event theme so that the public scoreboard matches the competition.

The main extra feature will be an AI **Route Assistant**. TopSend will first calculate competition statistics. Give those statistics to the AI. The AI will then explain them in language.

For instance, a Climber could ask:

**“What is the easiest route I haven't completed?”**

TopSend could compare problems using the route setters grade, completion percentage, flash rate, average attempts and the CLIMBERs own results.

Research has already looked at climbing‑specific recommender systems that use climber information and logged climbing activity to recommend climbing routes [15]. TopSend uses a recommendation idea but only for competition data.

A Climber could also ask:

**“How many more points do I need to reach third place?”**

TopSend could use the official standings and scoring information to explain the difference, between the CLIMBERs current score and the score of the target ranking.

An organizer could ask:

**“Which V4 problem was harder than expected by the gym organizers?”**

The system could compare V4 routes. Identify a problem with a much lower completion rate or a much higher average number of attempts.

AI will only provide recommendations and explanations. AI will not change scores decide a competition winner or automatically change the grade chosen by the route setter.

---

## Project Overview

### Description

TopSend will support three authenticated user roles: the **System Administrator** the **Gym Administrator / Event Organizer**. The **Climber**. TopSend will also support a **Visitor**. The **Visitor** represents someone who has not logged into TopSend.

The **Authentication subsystem** will be shared by all registered TopSend users. The **System Administrator** the **Gym Administrator** and the **Climber** will use the login process. After authentication TopSend will identify the role of the user. Provide the correct level of access.

A Visitor does not have an authenticated account role while browsing the parts of TopSend. The **Visitor** can access the login page create a **Climber** account view information where available or request **Gym Administrator** access.

A Visitor who creates a **Climber** account can complete the self-registration process and then log in as a **Climber**. Creating a **Climber** account does not automatically register the **Climber** for any competition.

Gym Administrator registration uses an approval process of normal self-registration.

If a Visitor represents a gym that is not yet registered, the Visitor can select **Register Your Gym** and provide these following:

- Contact name
- Contact email
- Gym name
- Gym location or address
- Other required contact information

If the gym already exists in TopSend, the Visitor can select **Request Gym Admin Access** and request access to the existing gym.

Submitting either request does not automatically provide permissions.

The **System Administrator (ADMIN)** manages the TopSend platform. System Administrator manage registered climbing gyms, Gym Administrator accounts, platform users, user access, and system-level settings.

The System Administrator also reviews gym-registration requests and **Gym Administrator** access requests. The System Administrator can. Reject a request. If an approved request is for a gym the gym can be added to TopSend. If the request is for an existing gym, the approved Gym Administrator can be connected to that gym.

After approval the user receives an invitation to finish setting up the GYM_ADMIN account. The user creates a password. Can then sign in using the shared TopSend login page.

A single gym can have **Gym Administrator (GYM_ADMIN)** accounts. These accounts may belong to the gym owner, the manager, the competition organizer or other authorized staff members.

For the version of TopSend, competition staff or judges do not require a separate system role. Staff members who need permission to manage competition information or to enter results can be given authorized **Gym Administrator** access.

The **Gym Admin Dashboard** will give Gym Administrators an overview of competitions belonging to their gym and access to the main competition-management tools.

The first step for an organizer will be creating a competition. The Gym Administrator can enter the competition name the gym location, the date the event description, the maximum number of climbers and other required event information. The Gym Administrator can later view the registered Climber count and control whether registration is open or closed.

The first version will focus on **Toronto gym-hosted bouldering competitions**. This keeps the project smaller. Avoids trying to support lead climbing, speed climbing, provincial events and professional competition formats at the same time.

Ontario competition climbing already has competition structures through the Ontario Climbing Federation and Climbing Escalade Canada. **TopSend** is not intended to replace those governing systems. **TopSend** is focused on local competitions hosted directly by gyms.

The **Gym Administrator** can create divisions for the event, such as Beginner, Intermediate, Advanced, Open, Youth or other categories selected by the gym. **Climbers** who register for the event can be assigned to the division.

The Gym Administrator can then create the boulder problems for the competition. Each problem can include a problem number or name an estimated V-grade, a point value if required, category restrictions and optional notes. The initial difficulty will come from the gyms route setters. TopSend will not attempt to grade the route before the event.

Bouldering competitions can use competition and scoring formats. Canadian competition climbing uses defined bouldering procedures and scoring rules. Smaller gym competitions may use formats such, as redpoint events. TopSend will therefore allow the gym to select from the scoring formats supported by the application than assuming every local event follows one format.

Gym Administrators can note whether a Climber has tried a problem finished a problem flashed a problem or reached another outcome that fits the chosen scoring format.

The official scoring system will run through application logic instead of using AI. This is important because every Climber must receive the exact rules. The system will not be able to decide which Climber is winning or alter a Climbers result.

A major feature of TopSend will be the **live leaderboard**. When a Gym Administrator records a result the system will recompute the Climbers score and ranking. The new result will then show on the leaderboard.

For example, if Andrew is ranked fifth and finishes a problem, the system could shift the ranking and move Andrew into third place if the official scoring rules place Andrews new score above the Climbers who are currently ahead of Andrew. A gym could display the live leaderboard on a television or projector while Climbers view it from their phones.

Visitors may also look at a leaderboard when public viewing is enabled. Public leaderboard access does not grant any competition‑management permissions.

The gym can customize the look of the competition. Organizers can pick backgrounds upload their gym or event logo add sponsor images and decide which information appears on the leaderboard.

The **Competition Discovery and Registration subsystem** will let Climbers find competitions before joining an event.

Climbers will have two event browsing options:

1. **Competition List View**
2. **Competition Map View**

The List View will show events with basic information such as the competition name, gym, date and location.

The Map View will use the Google Maps API to show the places of gyms hosting competitions. Climbers can see event location pins pick a location view competition information and go to the Event Details page.

The Event Details page will provide information before registration including:

- Event description
- Date
- Gym location
- Available divisions
- Maximum number of climbers
- Number of remaining spaces
- Registration availability

A registered Climber can pick an available division and register while registration is open.

Having a TopSend account does not automatically register a Climber for a competition. Competition registration is an action linked to the event chosen by the Climber.

After registration, the Climber can view their Registration Status. The system can display whether the registration is confirmed. If the competition reaches its capacity the system can show that the event is full and if the gym has enabled the feature let the Climber join a waitlist.

A **My Events** section will let Climbers see competitions they have already registered for and use the tools for those events.

During the competition, a Climber can use **My Scorecard** to see the boulder problems, unfinished routes and the Climbers recorded official results.

Climbers can also use the **Ranking and Leaderboard** section to view the competition standings and the Climbers current position.

TopSends main difference will surface after Climbers start generating results. Every recorded attempt gives information that can help describe the difficulty of a problem.

For instance imagine there are four problems and all are initially graded V4:

| Problem | Completion Rate | Average Attempts | Flash Rate |
|----------|----------------:|-----------------:|-----------:|
| Problem 8 | 72% | 1.8 | 40% |
| Problem 9 | 65% | 2.3 | 31% |
| Problem 10 | 59% | 2.7 | 25% |
| Problem 11 | 16% | 5.1 | 5% |

An organizer could ask:

**“Which V4 was harder than we expected?”**

TopSend could point to Problem 11 because Problem 11s performance is very different from the problems given the same grade.

This information matters because climbing grades are not fully objective. Research says climbing grading is subjective and also shows the importance of using ways to describe climbing grades and ability [12]–[14] [19] [20].

The **Gym Admin AI Route Assistant** will allow Gym Administrators to ask questions about the route statistics generated during the competition.

The **Climber** version of the AI Route Assistant will use information but answer different questions. A Climber could ask:

**“What should I try next?”**

TopSend can delete routes that the Climber has already finished look at the routes that are still left and then give the Climber a suggestion that is based on how the Climber did in the competition and on the Climbers results.

Other questions could include:

- What is the easiest route?
- What is the hardest route?
- Which route should I try next?
- Which remaining problem has the highest completion rate?
- Which V4 has the highest flash rate?
- Which problem are Beginner Climbers struggling with?
- Which problem took the most attempts?
- Which route appears harder than its assigned grade?
- Which remaining problem gives me a realistic chance of improving my score?
- How many more points do I need to reach a target ranking?

Research that focuses on climbing has already looked at using a Climbers past climbs, likes and how hard the Climber thinks each route is to suggest good routes. TopSend will use this idea for competition data.

A routes grade will not be the thing that decides how the Climber will do. Studies of climbing say that the Climbers performance can also depend on the Climbers body, technique and experience. Because of this TopSend will show its ideas as tips, not promises.

The **Competition History** section will hold competitions, results and data about how routes did all linked to the gym. If the gym keeps using TopSend it can grow a record that lets organizers look at how different events compare over time.

TopSend will use the **MERN stack**. React will build the screen the Climber sees. Node.js and Express will run the server and the REST API. MongoDB will keep all the data about gyms, users requests from Gym Administrators, competitions, routes, signups, attempts and results. Socket.IO will handle updates that happen live during a competition. The Google Maps API will help the Climber find competitions, on a map.

### In Scope

The complete TopSend project scope will include:

#### Authentication and User Onboarding

- One shared login system for people who have registered
- Access for people who are not registered to use public features
- Climber account self-registration
- Requests to register a gym
- Requests for gym administrator access
- System administrators check gym admin requests
- Approval or rejection of gym admin requests
- Invitations for gym administrator accounts
- ADMIN accounts
- GYM_ADMIN accounts
- CLIMBER accounts
- Role-base permission

#### System Administration

- System Administrator
- Admin Dashboard
- Management of registered gyms
- Review of gym requests
- Details for each gym
- Multiple gym administrator accounts for each gym
- Management of gym administrators
- Review of access requests for gym administrators
- Details for each administrator
- Management of platform users
- Details for each user
- System Configuration
- Advanced Settings

#### Competition Management

- Gym Admin Dashboard
- Creation of competitions
- Details for each competition
- Event name, date, location and description
- Maximum number of people allowed
- Registration that is open or closed
- Competition divisions
- Management of climbers
- Details for each climber
- Creation of bouldering problems
- Details for each route
- V-grades assigned by route setters
- Notes for each route
- Point values

#### Competition Discovery and Registration

- Competition discovery
- Competition search and filtering
- Competition List View
- Competition Map View
- Google Maps API integration
- Competition location pins
- Event Details
- Climber self-registration for competitions
- Division selection during registration
- Maximum-capacity information
- Remaining-space information
- Registration Status
- Optional waitlist when enabled
- My Events

#### Scoring and Live Results

- Supported bouldering scoring methods
- Tracking of attempts and sends
- Flash tracking if supported
- Entry of results
- Automatic calculation of official scores
- Calculation of rankings
- Live leaderboard
- Public leaderboard for visitors and spectators
- Digital scorecards for individuals
- Custom backgrounds for leaderboards
- Gym and competition logos
- Images of sponsors

#### Analytics and AI

- Completion-rate statistics
- Average-attempt statistics
- Flash-rate statistics
- Gym Admin AI Route Assistant
- Climber AI Route Assistant
- Natural-language questions
- AI route recommendations
- AI explanation of current ranking differences
- AI comparison between assigned grades and competition results
- Competition History

#### General

- Toronto indoor climbing gyms
- Local bouldering competitions
- Responsive desktop interface
- Responsive tablet interface
- Responsive mobile interface

### Out of Scope

The first release will not include:

- Climbing gyms outside Toronto
- Ontario-wide competition management
- Provincial federation events
- National climbing competitions
- IFSC-certified competitions
- Lead climbing
- Speed climbing
- Computer vision
- Automatic route grading from photographs
- Video movement analysis
- Automatic hold recognition
- Smart sensors on climbing holds
- Automatic detection of completed climbs
- Full climbing-gym membership management
- Gym point-of-sale systems
- Employee scheduling
- Payroll
- Native Android or iOS applications
- Automatic public creation of GYM_ADMIN accounts without approval
- AI changing official competition scores
- AI deciding competition winners
- AI automatically changing official route grades

These features may be considered later, but including them in the first version would make the project too large for one academic term.

---

## Value Proposition

The first value TopSend offers is **a competition workflow**. Now climbing platforms like Griptonite do a lot more than just score competitions. They also offer route databases route tags, TV systems, challenges, analytics and other gym tools [3].

TopSend’s chance is to be an option for gyms that mostly want to run local competitions. For example a small gym in Toronto might not need all the extra features just to host an events each year. But we’d need to check if this simpler approach is actually what gym staff want. Through interviews or surveys. Before saying simplicity or cost is a real problem.

There are also tools out there. ClimbLive calls itself free. Gives self-scoring real-time results and an organizer dashboard [11]. So TopSend can’t win by being cheaper.

TopSend will also have an onboarding process. If a gym owner or staff member finds TopSend they can submit a gym-registration or Gym Administrator access request.. Topsend won’t automatically trust anyone who says they represent a gym. A System Administrator will review the request before giving admin access.

The second source of value is ** use of competition data**.

Every competition already collects attempt and completion data because that’s needed for scoring. TopSend will reuse that data to create statistics for route setters and climbers. No need for the gym to collect data after the event.

For route setters this could be feedback. If most V4 routes get completed 60% of the time but one only gets completed 15% of the time the setter might want to look into why. It doesn’t mean they made a mistake. Just that they have information to work with.

This idea has research support. Climbing grades are subjective [12]. Other studies show that past climber performance can help estimate or analyze route difficulty [13] [14] [19] [20].

The third value is **helping climbers make decisions during an event**. A climber might have unfinished problems and not much time left. A normal leaderboard shows their score but it doesn’t say which problem they should try next.

Research in climbing- recommendations shows that route suggestions can use a climber’s activity and preferences to help them decide [15]. TopSend can do something using the current competition results.

The fourth value is **competition discovery and location information**. Climbers can browse events using a List View or see event locations on a Google Maps-based Map View. The list makes it easy to compare events while the map shows where each competition is happening.

The fifth value is **real-time event engagement**. Climbers and visitors can follow rankings as the competition happens. Tools like BoulderScoring, SteepScores, Griptonite, Vertical-Life and ClimbLive already offer leaderboards so this is something people expect from competition software. Not a unique feature for TopSend.

TopSend will combine it by including scorecards, route statistics and customizable visuals. A local gym could design its competition background show sponsor images and display the event on a TV or projector.

The final value is the **Toronto- focus and competition history**. Toronto kept adding climbing gyms in 2025 like Hogtown Boulders and Ethos Climbing [2]. Of trying to serve every gym, in Canada right away TopSend can focus on how Toronto gyms run smaller community competitions.

Ontario and Canadian climbing organizations already have competitive systems and rules [16]–[18]. TopSend isn’t trying to replace them. Its first goal is gym-hosted events that use simpler formats.

If a Toronto gym uses TopSend over and over the system can build up a history of route grades attempts, completion rates, flash rates, divisions and results. That history could later help the gym compare one competition to another.

If the first version works well the product could expand to the GTA. Then the rest of Ontario.

---

## Similar Products

### Griptonite

Griptonite is a strong competitor because it already offers a mature climbing competition system. Its competition tools allow both judged and self-scored events, several scoring formats, live leaderboards, digital scorecards and television displays. Griptonite also supplies an extensive route-management system [3] [4].

This means I should not say that Griptonite ignores gyms or that basic competition management is entirely new.

TopSend will instead test whether a focused Toronto competition workflow that uses competition-specific conversational analytics offers useful extra value.

### Vertical-Life

Vertical-Life offers a broader climbing platform. Its competition service supports competition formats, categories, live scoring, online results, registration and payments. It can handle everything from boulder events to professional competition formats [5].

Vertical-Life is especially important in Ontario because the Ontario Climbing Federation adopted it as its scoring platform for the 2025–26 season [6].

This gives Vertical-Life an advantage for provincial competition use. TopSend will not try to replace it for OCF competitions. TopSend will focus on gym-hosted events in Toronto.

### KAYA

KAYA combines climbing logs, route information, gym analytics, competitions, challenges, leagues and community features.

For gyms KAYA supplies routesetting feedback, quality metrics, climber demographics setter productivity data and challenge or league management [7].

This means KAYA already offers route analytics. TopSend therefore cannot say that analyzing climbing data itself is entirely new.

The planned difference is the ability to ask competition‑specific natural‑language questions during an event using that events results and for Climbers their own competition data.

### BoulderScoring

BoulderScoring is much closer to TopSends scope. It provides competition creation, categories, self‑entry or judge mode, flexible scoring and live leaderboards [8].

It also includes Climber V‑grade feedback after a boulder is finished, which gives organizers useful information about how difficult the route seems to climbers [9].

This is important because it shows that TopSend cannot say that route‑difficulty feedback itself is unique.

TopSend would instead combine organizer grades, actual completion statistics, attempts and individual performance into natural‑language questions and explanations.

### SteepScores

SteepScores provides competition creation live leaderboards, several scoring formats, multiple categories, judge scoring, competition series, leagues, registration and payment processing [10].

Its registration and payment features are broader than the version of TopSend that we plan.

TopSend would not try to compete with all of these features. Its scope will stay smaller. Focus on Toronto bouldering competitions plus event‑data analysis.

### ClimbLive

ClimbLive presents a comparison because it is a simple competition product rather than a full climbing platform.

It offers self‑scoring, live results, an admin dashboard and no required Climber account. It also advertises itself as free [11].

This shows why affordability alone cannot be TopSends selling point.

Instead TopSend needs to provide something, beyond scoring. Competition discovery, Climber accounts, gym onboarding, route statistics, competition history and the AI Route Assistant are therefore parts of the proposal.

---

## Differentiators

TopSend’s first main differentiator will be **competition‑focused analysis**.

Existing products already collect scores, update standings and produce statistics. TopSend will try to make those statistics easier to understand through natural‑language questions.

For example, an organizer should be able to ask:

**“Which V4 route performed much harder than the other V4s?”**

Instead of manually checking every problem, TopSend could compare their completion rates, average attempts, and flash rates and explain which problem stands out.

A Climber could ask:

**“Which route should I try next?”**

The system could examine that Climber’s unfinished problems and use event results to recommend a realistic option.

A Climber could also ask:

**“How many more points do I need to reach third place?”**

TopSend could compare the Climber’s score with the current standings and explain the difference. The AI would not change the score. Guarantee that completing a particular route will result in a final ranking because standings can continue to change during the event.

Climbing‑specific research has already explored recommendations for climbing routes [15]. TopSend’s difference is that the recommendation will be based on a live competition its route statistics and the individual Climber’s competition results.

The second differentiator is the combination of **route setter opinion and Climber performance**.

The organizer’s original grade is not ignored. If the setter says that Problem 8 is V4 TopSend stores that as the grade.

Competition results then provide another point of view.

If the problem has:

- 60 Climbers
- 8 successful Climbers
- 13% completion
- 4.8 average attempts

while the other V4 problems have much higher completion percentages TopSend can flag the difference.

This approach fits with climbing research showing that grading is subjective and that performance data can provide information about difficulty [12]–[14] [19] [20].

The third differentiator is **keeping AI separate from competition decisions**.

TopSend will not let AI decide a winner because the Gym Organizer stays in control.

The application calculates the score.

The route setter or authorized gym staff controls the grade.

The gym controls the event.

AI only helps explain the data or provide recommendations.

This approach makes the feature easier to understand and lowers the risk that AI output will change competition results.

The fourth differentiator is **a focused local-event workflow**.

TopSend is not trying to take the place of a climbing gym’s membership software, point-of-sale system, employee management tools, class scheduling platform, payroll system or full route-management solution.

The first version has one main purpose:

**To help a climbing gym in Toronto organize and understand a local bouldering competition.**

That process covers everything from getting the gym on board finding the event locating the gym on a map signing up participants setting up the competition organizing divisions creating boulder problems scoring, live rankings, digital scorecards and analyzing how climbers performed on each route.

Lastly, AI might seem powerful, but it’s not a lasting edge. Other companies could copy those tools over time. The real long-term strength would come from **the gym’s history, with competitions**—the data that builds up over years of events the patterns, the feedback, the trends. That kind of insight is hard to replicate and deeply tied to the gym’s identity.

If a Toronto gym uses TopSend repeatedly, the system could eventually build a history of:

- Competition results
- Route grades
- Completion percentages
- Climber divisions
- Attempts
- Flash rates
- Previous competition difficulty

The organizer could eventually ask questions such as:

**“Were our V4 problems harder this year than last year?”**

or:

**“Which grades normally have the biggest difference between setter grade and Climber performance?”**

This historical data would be specific, to that gym.

For the release however, the project will focus on a smaller goal: a Toronto-based bouldering competition platform that connects gym onboarding, competition setup, climber registration, live scoring, digital scorecards, route statistics and AI-assisted interpretation of competition results.

---

## References

[1] Climbing Business Journal, “Gyms and Trends 2025,” 2026.

[2] Climbing Business Journal, “2025 CBJ Gym List Awards,” 2026.

[3] Griptonite, “The Software for Modern Climbing Gyms,” 2026.

[4] Griptonite, “Competition Platform,” 2026.

[5] Vertical-Life, “Challenges & Competitions,” 2026.

[6] Ontario Climbing Federation, “2025–26 Membership and Scoring Platforms,” 2025.

[7] KAYA Climb, “KAYA for Gyms,” 2026.

[8] BoulderScoring, “Competition Scoring for Climbing Gyms,” 2026.

[9] BoulderScoring, “Setup Guide & Reference,” 2026.

[10] SteepScores, “Simple Competition Management,” 2026.

[11] ClimbLive, “Free Bouldering Competition Scoring App,” 2026.

[12] D. Saul, G. Steinmetz, W. Lehmann, and A. F. Schilling, “Determinants for Success in Climbing: A Systematic Review,” *Journal of Exercise Science & Fitness*, vol. 17, no. 3, pp. 91–100, 2019.

[13] B. O'Mara and M. S. Mahmud, “Addressing Grading Bias in Rock Climbing: Machine and Deep Learning Approaches,” *Frontiers in Sports and Active Living*, vol. 6, 2025.

[14] A. Drummond and A. Popinga, “Bayesian Inference of the Climbing Grade Scale,” 2021.

[15] I. Ivanova, M. Andrić, and F. Ricci, “Content-Based Recommendations for Crags and Climbing Routes,” in *Information and Communication Technologies in Tourism 2022*, pp. 369–381, 2022.

[16] Ontario Climbing Federation, “Rules: 2025–2026 Rulebook,” 2025.

[17] Climbing Escalade Canada, “Competition Rules,” 2025–2026.

[18] Climbing Escalade Canada, “Sport Climbing,” 2026.

[19] N. Draper, T. Dickson, G. Blackwell, S. Fryer, S. Priestley, D. Winter, and G. Ellis, “Self-Reported Ability Assessment in Rock Climbing,” *Journal of Sports Sciences*, vol. 29, no. 8, pp. 851–858, 2011.

[20] N. Draper et al., “Comparative Grading Scales, Statistical Analyses, Climber Descriptors and Ability Grouping: International Rock Climbing Research Association Position Statement,” *Sports Technology*, vol. 8, no. 3–4, 2016.

[21] L. V. Giles, E. C. Rhodes, and J. E. Taunton, “The Physiology of Rock Climbing,” *Sports Medicine*, vol. 36, no. 6, pp. 529–545, 2006.
