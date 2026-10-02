# User Roles and Personas

## Overview

This document explains the user roles that interact with TopSend. Each role has its responsibilities, goals, access levels and needs inside the system. I hope you find this helpful.

The user roles are:

- ADMIN - System Administrator
- GYM_ADMIN - Gym Administrator / Event Organizer
- CLIMBER - Climber
- VISITOR - Visitor

All authenticated users use the same Authentication subsystem. After login, TopSend checks the user's assigned role and provides access to the correct features.

A Visitor is a user who has not logged in and therefore cannot use account features. Visitors can use features create a Climber account or request Gym Administrator access.

TopSend is a responsive web application that can be accessed using desktop, tablet, or mobile devices.

---

## User Role 1: System Administrator

**Role Identifier:** ADMIN

**Description:**  
The System Administrator runs the entire TopSend platform instead of one gym's contests. This user has control over registered gyms, Gym Administrator accounts, platform users, permissions, and settings of the system. 

The System Administrator also handles requests from people willing to register a new gym or receive access to the Gym Administrator function. The purpose of the position is to keep everything in order and let only authorized users in.

**Primary Goals:**

- Manage registered climbing gyms and Gym Administrator accounts.
- Review and approve or reject gym-registration and Gym Administrator access requests.
- Manage platform users, permissions, and account access.
- Maintain important TopSend system settings.

**Technical Expertise:**  
High - comfortable using administrative software, user-management tools, permissions, and system settings.

**Key Characteristics:**

- Has the highest level of access in TopSend.
- Can manage multiple climbing gyms and Gym Administrator accounts.
- Reviews requests submitted by Visitors who represent climbing gyms.
- Can connect an approved Gym Administrator to the correct gym.
- Uses the shared TopSend Authentication subsystem.

**Constraints or Pain Points:**

- Needs to verify requests before providing Gym Administrator access.
- Needs an efficient way to manage multiple gyms and user accounts.
- Needs platform information and permissions to remain accurate.
- Must avoid giving unauthorized users access to administrative features.

---

## User Role 2: Gym Administrator / Event Organizer

**Role Identifier:** GYM_ADMIN

**Description:**  
A Gym Administrator is a recognized owner, manager, contest organizer or staff of a climbing gym, who utilizes TopSend to conduct local bouldering competitions.

A person who desires to become a Gym Administrator should initially be a Visitor. If the gym is not found on the platform, a request for registration can be sent. If the gym already exists on TopSend, a Gym Administrator access can be requested. 

The request will need to be authorized by the System Administrator to allow the new user to begin as a GYM_ADMIN. After authorization has occurred the new user should finalize account setting and start organizing events for their gym.

**Primary Goals:**

- Create and manage local bouldering competitions for their gym.
- Manage divisions, registered Climbers, routes, and competition capacity.
- Record official competition results and monitor live rankings.
- Review route statistics and use the AI Route Assistant to understand competition performance.

**Technical Expertise:**  
Medium - comfortable using standard websites, mobile applications, and common administrative tools.

**Key Characteristics:**

- Is connected to a specific registered climbing gym.
- Must receive approval before receiving GYM_ADMIN access.
- One gym can have multiple Gym Administrator accounts.
- Can create competitions, divisions, and boulder problems.
- Can record official results and manage competition information.
- Can view statistics created from official competition results.
- Uses the shared TopSend Authentication subsystem.

**Constraints or Pain Points:**

- Cannot give themselves Gym Administrator access without approval.
- Should only be able to manage competitions for an authorized gym.
- Needs scoring and rankings to remain accurate during an active event.
- Needs participant capacity and registration information to stay current.
- Needs competition-management tools to be easy to use while running an event.
- Needs AI analysis to use real competition data without changing official results or route grades.

---

## User Role 3: Climber

**Role Identifier:** CLIMBER

**Description:**  
The Climber is a TopSend-registered user who aims to take part in the local bouldering challenges available.

A Climber has the option of creating the account via public registration, check the competitions by switching to either List View or Map View, and get information about events including registering for competitions, and accessing the event data through features like My Events, My Scorecard, Ranking & Leaderboard as well as AI Route Assistant.

While creating a Climber account does not automatically register you for a competition, registration must be completed separately.

**Primary Goals:**

- Discover and register for local bouldering competitions.
- View event information, available divisions, locations, and remaining spaces.
- Track personal competition results through My Events and My Scorecard.
- View rankings and use the AI Route Assistant to help make competition decisions.

**Technical Expertise:**  
Low to Medium - comfortable using normal websites and mobile applications but does not require technical or administrative experience.

**Key Characteristics:**

- Can create a Climber account without System Administrator approval.
- Can participate in competitions hosted by different registered gyms.
- Can discover events using List View or the Google Maps-based Map View.
- Can access competitions they have registered for through My Events.
- Can view their own official results, scorecard, and current ranking.
- Cannot modify official competition results or scoring.
- Uses the shared TopSend Authentication subsystem.

**Constraints or Pain Points:**

- Needs to quickly find competitions and understand where they are located.
- Needs clear information about divisions, registration status, and remaining spaces.
- Needs quick access to their scorecard and ranking during an active competition.
- Needs clear confirmation that their competition registration was successful.
- Needs AI recommendations to be understandable and based on actual competition information.
- Cannot use the AI Route Assistant to change official scores, rankings, or route grades.

---

## User Role 4: Visitor

**Role Identifier:** VISITOR

**Description:**  
The Visitor is a person who is using TopSend without being logged in.

A Visitor has limited access to the system. They may visit TopSend because they want to create a Climber account, log in to an existing account, view public competition information, or represent a climbing gym that wants to begin using TopSend.

A Visitor who wants Gym Administrator access cannot create a GYM_ADMIN account directly. They must submit a gym-registration or Gym Administrator access request for review by the System Administrator.

**Primary Goals:**

- Access the TopSend login or account-registration pages.
- Create a Climber account.
- Register a new gym or request Gym Administrator access to an existing gym.
- View public competition information and public leaderboards where available.

**Technical Expertise:**  
Low - only basic experience using websites is required.

**Key Characteristics:**

- Is not logged into TopSend.
- Does not have authenticated ADMIN, GYM_ADMIN, or CLIMBER permissions.
- Can create a Climber account without administrative approval.
- Can submit a request for Gym Administrator access.
- Can provide information for a new gym-registration request.
- May view public competition information where public access is enabled.
- Can later become an authenticated CLIMBER or GYM_ADMIN depending on the account process completed.

**Constraints or Pain Points:**

- Cannot access private account features while logged out.
- Must create and log in to a Climber account before using private Climber features.
- Must receive System Administrator approval before receiving GYM_ADMIN access.
- Cannot access private Gym Administrator or System Administrator features.
