# Project Proposal

**Project Name:** TopSend
**Authors:** [Andrew, Gabriel, Joseph, Richard, Brian]

---

## Overview

Indoor climbing has continued to grow in Canada, and Toronto has an active climbing community with both established gyms and newer facilities. In 2025, Hogtown Boulders and Ethos Climbing were among the new Canadian climbing gyms that opened in Toronto. Across North America, the number of climbing gyms passed 900 facilities [1], [2].

Local climbing gyms often organize bouldering competitions and community events. Running these events means keeping track of competitors, climbing problems, attempts, scores, categories, and rankings. Existing products already provide many of these features, but there is still a range between large paid climbing platforms and simpler competition-scoring tools. For example, Griptonite currently offers a competition-only package at $2 per competitor with a one-time setup fee, while ClimbLive provides basic bouldering competition scoring and live results for free [3], [11].

TopSend is a web-based competition platform designed first for **indoor climbing gyms in Toronto that run local bouldering competitions**. The goal is to keep competition setup simple while providing live scoring, customizable scoreboards, and useful information from the competition data. A main feature of TopSend will be an AI Route Assistant that allows climbers and organizers to ask questions such as, “What is the easiest route?”, “Which route should I try next?”, or “Which route seems harder than the grade originally assigned by the route setter?”

---

## Executive Summary

### Problem Statement

Climbing gyms that organize local competitions need a reliable way to create events, register competitors, record attempts, calculate scores, and show standings. There are already several systems that solve parts of this problem. Griptonite provides competition scoring, TV leaderboards, route management, and other gym features. Vertical-Life supports competitions ranging from local events to professional competition formats. KAYA combines competitions with route management and climber analytics. Other products such as BoulderScoring, SteepScores, and ClimbLive focus more directly on scoring and live leaderboards [3]–[11].

This means TopSend cannot simply solve the problem by adding another leaderboard. Instead, the project will focus on a more specific gap. Some existing systems include large sets of gym-management features and setup or subscription costs, while simpler and even free tools mainly focus on entering scores and displaying rankings. For a Toronto gym that only wants to run an occasional local competition, there may be room for a lightweight competition-focused system that is easy to set up but still provides useful analysis.

Another issue is that competition data is usually collected mainly to calculate standings. Attempts, sends, flash rates, and completion percentages can also show how difficult each problem actually felt to competitors. Climbing grades are subjective, and research has shown that route difficulty can be estimated using climber performance and historical ascent information [12]–[14].

TopSend will therefore focus on **simple local competition management plus better understanding of the data already created during the competition**.

### Proposed Solution

TopSend will provide a web application where a Toronto climbing gym can create and run a local bouldering competition without needing a complete gym-management system.

An organizer will be able to create a competition, add divisions, create boulder problems, assign initial route grades, register competitors, and choose the scoring format. During the event, authorized staff will enter attempts and successful climbs. TopSend will calculate scores automatically and update the leaderboard in real time.

The system will also provide customizable digital scorecards and leaderboard screens. A gym could add its own logo, competition background, sponsor images, and event theme so that the public scoreboard matches the competition.

The main additional feature will be an **AI Route Assistant**. TopSend will calculate competition statistics first and give those statistics to the AI. The AI will then explain them in normal language.

For instance, a competitor could ask:

**“What is the easiest route I haven't completed?”**

TopSend could compare unfinished problems using the route setter's grade, completion percentage, flash rate, average attempts, and the competitor's own results.

An organizer could ask:

**“Which V4 problem was harder than we expected?”**

The system could compare the V4 routes and identify a problem with a much lower completion rate or much higher average number of attempts.

AI will only provide recommendations and explanations. It will not change official scores or automatically change the grade chosen by the route setter.

---

## Project Overview

### Description

TopSend will mainly support four types of users: the **gym administrator, competition staff or judges, competitors, and spectators**. The gym administrator will control the competition setup. Judges will enter competition results. Competitors will be able to view their scores and route information. Spectators will have access to the public leaderboard.

The first step for an organizer will be creating a competition. The organizer can enter the competition name, gym location, date, divisions, event description, scoring format, and basic visual settings. The first version will focus only on **Toronto gym-hosted bouldering competitions**. This keeps the project smaller and avoids trying to support lead climbing, speed climbing, provincial events, and professional formats at the same time.

The organizer can then create the boulder problems for the competition. Each problem can include a problem number or name, an estimated V-grade, point value if required, category restrictions, and optional notes. The initial difficulty will come from the gym's route setters. TopSend will not attempt to automatically grade the route before the event.

Competitors can be organized into divisions such as Beginner, Intermediate, Advanced, Open, Youth, or any categories selected by the gym. Competition staff can record whether a competitor attempted a problem, reached a scoring zone, completed the problem, or flashed it depending on the scoring format being used.

The official scoring system will be handled through normal backend logic rather than AI. This is important because every competitor should be scored using the exact same rules. The AI should not have any ability to decide who is winning or change a competitor's official result.

A major feature of TopSend will be the **live leaderboard**. When a judge records a result, the server recalculates the competitor's score. The updated ranking is then sent to the leaderboard without requiring users to refresh the page. Socket.IO is designed for bidirectional, low-latency communication between clients and servers, which makes it suitable for this type of live scoreboard [18].

For example, if Andrew is ranked fifth and completes a difficult problem, the system could immediately update the ranking and move him into third place. A gym could show the same live leaderboard on a television or projector while competitors view it from their phones.

The gym can also customize the appearance of the competition. Organizers will be able to select backgrounds, upload their gym or event logo, add sponsor images, and choose what information is shown on the leaderboard.

TopSend's main difference will appear after competitors begin generating results. Every attempt creates information that can help describe the difficulty of a problem.

In instance, imagine there are four problems and all initially graded V4:

| Problem    | Completion Rate | Average Attempts | Flash Rate |
| ---------- | --------------: | ---------------: | ---------: |
| Problem 8  |             72% |              1.8 |        40% |
| Problem 9  |             65% |              2.3 |        31% |
| Problem 10 |             59% |              2.7 |        25% |
| Problem 11 |             16% |              5.1 |         5% |

An organizer could ask:

**“Which V4 was harder than we expected?”**

TopSend could identify Problem 11 because its performance is very different from the other problems assigned the same grade.

This information matters because climbing grades are not completely objective. A systematic review of climbing research describes grading as subjective, with grades initially suggested and later influenced by feedback from other climbers [12]. More recent work has also examined the use of machine learning and climbing-performance data to estimate route difficulty [13], [14].

The competitor version of the AI feature will use similar information but answer different questions. A competitor could ask:

**“What should I try next?”**

TopSend could remove routes the competitor has already completed, compare the remaining routes, and give a recommendation based on competition performance and the competitor's own results.

Other questions could include:

* What is the easiest route?
* What is the hardest route?
* Which route should I try next?
* Which remaining problem has the highest completion rate?
* Which V4 has the highest flash rate?
* Which problem are Beginner competitors struggling with?
* Which problem took the most attempts?
* Which route appears harder than its assigned grade?
* Which remaining problem gives me a realistic chance of improving my score?

Sports recommender-system research has shown that recommendation systems can support decisions in areas such as training, tactics, and other sport activities [15]. The research also identifies explanation of recommendations as an area that can still be improved [15].

TopSend will use the **MERN stack**. React will provide the user interface. Node.js and Express will run the backend and REST API. MongoDB will store competitions, routes, users, attempts, and results. Socket.IO will manage live competition updates.

#### In Scope

The first version of TopSend will include:

* Toronto indoor climbing gyms
* Local bouldering competitions
* User registration and login
* Gym administrator accounts
* staff accounts
* Role-based permissions
* Competition creation
* Competition divisions
* Competitor management
* Boulder problem creation
* Route setter-assigned V-grades
* Attempts and send tracking
* Supported bouldering scoring formats
* Automatic score calculation
* Ranking calculation
* Live leaderboard
* Real-time Socket.IO updates
* Public spectator leaderboard
* Individual digital scorecards
* Custom leaderboard backgrounds
* Gym and competition logos
* Sponsor images
* Completion-rate statistics
* Average-attempt statistics
* Flash-rate statistics
* AI Route Assistant
* Natural-language questions
* AI route recommendations
* AI comparison between assigned grades and competition results
* Competition history
* Responsive web interface

#### Out of Scope

The first release will not include:

* Climbing gyms outside Toronto
* Ontario-wide competition management
* Provincial federation events
* National climbing competitions
* IFSC-certified competitions
* Lead climbing
* Speed climbing
* Computer vision
* Automatic route grading from photographs
* Video movement analysis
* Automatic hold recognition
* Smart sensors on climbing holds
* Automatic detection of completed climbs
* Full climbing-gym membership management
* Gym point-of-sale systems
* Employee scheduling
* Payroll
* Native Android or iOS applications
* AI changing official competition scores
* AI automatically changing route grades

These features may be considered later, but including them in the first version would make the project too large for one academic term.

---

## Value Proposition

The first value TopSend offers is **a focused competition workflow**. Existing climbing platforms can do much more than competition scoring. Griptonite, for example, also provides route databases, route tags, TV systems, challenges, analytics, and other gym features. Its current competition-only option costs $2 per competitor and includes a one-time $340 setup fee, while its larger package is currently listed at $85 per month when paid annually [3]. The company specifically states that it designs its pricing for both smaller and larger gyms, so TopSend should not claim that smaller gyms simply cannot use it.

Instead, TopSend's opportunity is to provide another choice for a gym that mainly wants to run local competitions. A smaller Toronto gym might not need a complete route-management or gym-management platform just to run several competitions each year. The actual demand for this simpler approach would need to be confirmed through interviews or surveys with Toronto gym staff before claiming that cost is a major barrier.

Free competition tools also exist. ClimbLive describes itself as free and provides self-scoring, real-time results, and an organizer dashboard [11]. This means TopSend cannot rely on low price alone as its main advantage.

The second source of value is therefore **better use of competition data**.

Every competition already generates attempts and completion information because these values are needed for scoring. TopSend will reuse this data to generate statistics for route setters and competitors. This does not require the gym to collect a separate dataset after the event.

For route setters, this could provide another source of feedback. If most V4 routes have a completion rate around 60% but one has a rate of 15%, the route setter may want to examine why the result was different. This does not mean the route setter made a mistake. It simply gives the setter more information.

This has support from climbing research. Climbing grades are subjective [12], while other researchers have shown that historical climber performance can be used to estimate or analyze route difficulty [13], [14].

The third value is **helping competitors make decisions during an event**. A competitor may have ten unfinished problems and limited time remaining. A normal leaderboard tells them their current score but does not necessarily tell them which problem is most realistic to attempt next.

TopSend can use the current competition results to provide a recommendation. Sports recommender research shows that recommendation systems can support sports-related decisions, including recommendations connected to performance and tactics [15].

The fourth value is **real-time event engagement**. Competitors and spectators can follow rankings while the competition is happening. Products such as BoulderScoring, SteepScores, Griptonite, Vertical-Life, and ClimbLive already provide real-time leaderboards, which shows that this is an expected feature in modern competition software rather than a unique TopSend feature.

TopSend will combine that expected feature with customizable visuals. A local gym could create its own competition background, display sponsor images, and put its event on a television without building a separate webpage.

The final value is the **Toronto-first focus**. Toronto continued to gain climbing facilities in 2025, including Hogtown Boulders and Ethos Climbing [2]. Instead of trying to build a product immediately for every gym in Canada, TopSend can focus on understanding how Toronto gyms run smaller community competitions.

If the first version is successful, the product could later expand into the GTA and the rest of Ontario.

---

## Similar Products

### Griptonite

Griptonite is one of the strongest competitors because it already provides a mature climbing competition system. Its competition tools support judged and self-scored events, different scoring formats, real-time leaderboards, and television displays. Griptonite also offers a broader route-management system.

Its current competition-only price is $2 per competitor with a $340 one-time setup fee. Its full package is listed at $85 per month when paid annually [3]. Griptonite also states that its plans are designed so smaller gyms can use the product, not only large facilities.

This means TopSend should not claim that Griptonite ignores smaller gyms. The difference TopSend will test is whether a more focused Toronto competition product with conversational analytics is useful enough to justify another option.

### Vertical-Life

Vertical-Life offers a much broader climbing platform. Its competition service supports different competition formats, categories, real-time scoring, online results, registration, and payments. It can support everything from local boulder events to professional competition formats [5].

Vertical-Life is especially important in Ontario because the Ontario Climbing Federation adopted it as its scoring platform for the 2025–26 season [6].

This gives Vertical-Life an advantage for official provincial competition use. TopSend will not attempt to replace it for OCF competitions. TopSend will target smaller gym-hosted events in Toronto.

### KAYA

KAYA combines climbing logging, route information, gym analytics, competitions, challenges, leagues, and community features.

For gyms, KAYA provides routesetting feedback, quality metrics, climber demographics, setter productivity information, and challenge or league management [7].

This means KAYA already provides significant route analytics. TopSend therefore cannot claim that analyzing climbing data itself is completely new.

The planned difference is the ability to ask **competition-specific natural-language questions during an event**, based on that event's current results.

### BoulderScoring

BoulderScoring is much closer to TopSend's smaller scope. It provides competition creation, categories, self-entry or judge mode, flexible scoring, and real-time leaderboards [8].

It also includes optional competitor V-grade feedback after a boulder is completed, which gives organizers useful information about perceived route difficulty [9].

This is important because it shows that TopSend cannot claim route-difficulty feedback itself is unique.

TopSend would instead combine organizer grades, actual completion statistics, attempts, and individual performance into natural-language questions and explanations.

### SteepScores

SteepScores provides competition creation, live leaderboards, several scoring formats, multiple categories, judge scoring, competition series, leagues, registration, and payment processing [10].

Its registration and payment features are actually broader than the planned first version of TopSend.

TopSend would not attempt to compete with all of these features. Its scope would remain smaller and focus on Toronto bouldering competitions plus event-data analysis.

### ClimbLive

ClimbLive presents an important comparison because it is a simple competition product rather than a full climbing platform.

It offers self-scoring, live results, an admin dashboard, and no required competitor account. It also advertises itself as free [11].

This shows why affordability cannot be TopSend's only selling point.

Instead, TopSend needs to provide something beyond basic scoring. The AI Route Assistant and the ability to analyze current competition performance are therefore important parts of the proposal.

---

## Differentiators

TopSend's first main differentiator will be **competition-focused conversational analysis**.

Existing products already collect scores, update standings, and produce useful statistics. TopSend will try to make those statistics easier to understand through natural-language questions.

For example, an organizer should be able to ask:

**“Which V4 route performed much harder than the other V4s?”**

Instead of manually checking every problem, TopSend could compare their completion rates, average attempts, and flash rates and explain which problem stands out.

A competitor could ask:

**“Which route should I try next?”**

The system could examine only that competitor's unfinished problems and use event results to recommend a realistic option.

The important part is that the AI answer will be based on actual competition information. It will not guess which route is easiest from the route's name or generate information that does not exist.

The second differentiator is the combination of **route setter opinion and competitor performance**.

The organizer's original grade is not ignored. If the setter says that Problem 8 is V4, TopSend stores that as the official grade.

Competition results then provide another point of view.

If the problem has:

* 60 competitors
* 8 successful competitors
* 13% completion
* 4.8 average attempts

while the other V4 problems have much higher completion percentages, TopSend can flag the difference.

This approach fits with climbing research showing that grading is subjective and that performance data can provide additional information about difficulty [12]–[14].

The third differentiator is **keeping AI separate from official competition decisions**.

TopSend will not let the AI decide a winner.

The backend calculates the score.

The route setter controls the official grade.

The gym controls the event.

AI only helps explain the data.

This makes the feature easier to understand and reduces the risk of incorrect AI output affecting competition results.

The fourth differentiator is **simplicity for local events**.

TopSend is not trying to replace a climbing gym's membership software, POS system, employee system, class scheduling system, or entire route-management system.

The first version has one main purpose:

**Help a Toronto gym run a local bouldering competition.**

That focus should make the application easier for the project team to build and easier for a gym organizer to understand.

Finally, AI itself is not a permanent competitive advantage because existing companies could add similar features. The more sustainable advantage would come from **gym-specific competition history**.

If a Toronto gym uses TopSend repeatedly, the system could eventually build a history of:

* Competition results
* Route grades
* Completion percentages
* Competitor divisions
* Attempts
* Flash rates
* Previous competition difficulty

The organizer could eventually ask questions such as:

**“Were our V4 problems harder this year than last year?”**

or:

**“Which grades normally have the biggest difference between setter grade and competitor performance?”**

This historical dataset would become specific to that gym.

For the first release, however, the project will focus on a smaller goal: **a simple Toronto bouldering competition platform with real-time scoring, customizable displays, and AI-assisted interpretation of competition results.**

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

[15] A. Felfernig, M. Wundara, T. N. T. Tran, V. M. Le, S. Lubos, and S. Polat-Erdeniz, “Sports Recommender Systems: Overview and Research Directions,” *Journal of Intelligent Information Systems*, vol. 62, pp. 1125–1164, 2024.

[16] MongoDB, “Integrate MongoDB with React — MERN Stack,” MongoDB Documentation, 2026.

[17] Meta, “React Documentation,” 2026.

[18] Socket.IO, “Bidirectional and Low-Latency Communication for Every Platform,” 2026.

[19] OpenJS Foundation, “About Node.js,” Node.js Documentation, 2026.

[20] OpenJS Foundation, “Express — Node.js Web Application Framework,” 2026.

[21] OpenAI, “Structured Outputs,” OpenAI API Documentation, 2026.

