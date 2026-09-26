# User Roles and Personas

## Overview

This document defines the distinct user roles that will interact with TopSend. Each role represents a different type of user with specific responsibilities, goals, and levels of access within the system. TopSend is a responsive web application, allowing users to access the platform from desktop, tablet, or mobile devices depending on their needs.

---

## User Role 1: System Administrator

**Role Identifier:** ADMIN

**Description:**
The System Administrator manages the overall TopSend platform. This user is responsible for managing registered climbing gyms, Gym Administrator accounts, user access, and platform-level settings. Unlike Gym Administrators, the System Administrator manages TopSend as a whole rather than managing competitions for a specific gym.

**Primary Goals:**

* Manage registered climbing gyms and their Gym Administrator accounts.
* Manage system-level user access and permissions.
* Monitor and maintain the overall TopSend platform.

**Technical Expertise:** High - comfortable managing software systems, users, permissions, and administrative settings.

**Key Characteristics:**

* Has the highest level of access within TopSend.
* Can manage multiple gym accounts and their associated administrators.
* Can access TopSend through desktop, tablet, or mobile devices using the responsive web interface.

**Constraints or Pain Points:**

* Must ensure that users only have access to features appropriate to their assigned role.
* Needs an efficient way to manage multiple gyms and user accounts within the platform.

---

## User Role 2: Gym Administrator / Event Organizer

**Role Identifier:** GYM_ADMIN

**Description:**
The Gym Administrator is an authorized member of a climbing gym who creates and manages bouldering competitions through TopSend. A single gym can have multiple Gym Administrator accounts, such as the gym owner, manager, competition organizer, or other authorized staff members who help manage competitions and events.

**Primary Goals:**

* Create and configure local bouldering competitions.
* Manage competitors, divisions, boulder problems, scoring, and competition results.
* Monitor live rankings, route statistics, competition history, and use AI-assisted analysis to understand route performance.

**Technical Expertise:** Medium - comfortable using standard websites, mobile applications, and administrative tools.

**Key Characteristics:**

* Belongs to and manages competitions for a specific climbing gym.
* Multiple Gym Administrator accounts can belong to the same gym.
* Can access and manage TopSend through desktop, tablet, or mobile devices using the responsive web interface.

**Constraints or Pain Points:**

* Needs to manage competitors, routes, scores, and competition information efficiently during an event.
* Needs competition scores, rankings, and route information to remain accurate and up to date.

---

## User Role 3: Competitor

**Role Identifier:** COMP

**Description:**
The Competitor is a registered TopSend user who participates in local bouldering competitions. After creating a Competitor account, the user can browse available competitions through a list or map view, view event details and locations, and register for competitions they want to join. Once registered for an event, the competitor can access their digital scorecard, route information, results, ranking, and AI-assisted route recommendations.

**Primary Goals:**

* Discover available bouldering competitions through a list or map view.
* View event details and register for competitions they want to participate in.
* View their scorecard, results, ranking, route information, and use the AI Route Assistant to help decide which route to attempt next.

**Technical Expertise:** Low to Medium - comfortable using standard websites and mobile applications.

**Key Characteristics:**

* Has a registered Competitor account within TopSend.
* Can register for competitions hosted by different climbing gyms.
* Can access TopSend through desktop, tablet, or mobile devices using the responsive web interface.

**Constraints or Pain Points:**

* Needs to quickly find relevant competitions and understand where they are located.
* Needs fast and simple access to competition information, scores, route details, and recommendations while participating in an event.
