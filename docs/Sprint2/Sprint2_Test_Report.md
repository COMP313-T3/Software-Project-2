## Automated Test Results

We ran the frontend and backend automated tests to make sure the main features of TopSend were still working properly after the updates for Iteration 2.

We ran the tests locally using VS Code on the `release/iteration-2` branch.

### Frontend Tests

Command used:

`npm test --prefix client`

Results:

- Test Files: 144 passed
- Tests: 2734 passed
- Failed: 0
- Duration: 53.59 seconds

**Result: PASS**

All frontend automated tests passed successfully. The tests covered different features, including login, account creation, competition discovery, competition maps, leaderboards, route statistics, result entry, onboarding, password reset, and other frontend features.

No failed tests were found during the frontend testing.

---

### Backend Tests

Command used:

`npm test --prefix server`

Results:

- Test Files: 55 passed
- Test Files Skipped: 1
- Tests: 1443 passed
- Tests Skipped: 16
- Failed: 0
- Duration: 11.84 seconds

**Result: PASS**

All backend tests that were executed passed successfully. The tests covered different parts of the system, including authentication, user permissions, competition management, scoring, registration, system settings, and other backend features.

Some tests were skipped by the test configuration, but there were no failed tests.

---

## Overall Automated Test Result

- Total Test Files Passed: 199
- Total Tests Passed: 4177
- Total Tests Skipped: 16
- Total Failed Tests: 0

**Overall Result: PASS**

Both the frontend and backend automated test suites completed successfully during our Iteration 2 testing.

We also checked that the existing features were still working after the latest updates from the `dev` branch were merged into `release/iteration-2`.

The automated tests included different scenarios, such as valid and invalid inputs, authentication, authorization, error handling, and other feature-related checks.

No failed tests were found during the final local automated testing run.

---

## Debugging and Retesting

During Iteration 2, we ran the frontend and backend automated tests to check for errors and make sure the recent changes did not affect existing features.

The frontend completed all 2734 tests, while the backend completed 1443 tests. There were no failed tests in either test suite.

The backend test output also included an error log from a system settings test that simulated a database failure. However, the test itself passed, so it did not cause the automated testing to fail.

Final testing results:

- Frontend Tests: 2734 passed
- Backend Tests: 1443 passed
- Total Tests Passed: 4177
- Failed Tests: 0
- Skipped Tests: 16

If a test fails, our debugging process is to check the error message, find what caused the issue, and make the necessary changes. After fixing the issue, we rerun the affected tests and then run the full test suite again to make sure nothing else was affected.

For this final local testing run, no additional fixes were needed because all executed tests passed.

---

## CI Testing

We also used GitHub Actions to automatically run the frontend and backend tests whenever the CI workflow is triggered by a push to the repository.

After merging the latest `dev` updates into `release/iteration-2`, we pushed the updated branch to GitHub and checked the CI workflow.

The GitHub Actions workflow ran successfully on the `release/iteration-2` branch.

### CI Results

- Workflow: TopSend CI
- Branch: `release/iteration-2`
- Frontend Test Files: 144 passed
- Frontend Tests: 2734 passed
- Backend Tests: Passed
- Failed Jobs: 0
- Overall CI Workflow: PASS
- Total Workflow Duration: 1 minute 52 seconds

Both the frontend and backend test jobs completed successfully, with no failed jobs.

The successful CI run confirmed that the automated tests were also passing on GitHub after the Iteration 2 code was pushed.

This helped us verify that the updated code was ready for the final review before merging into the `main` branch.

**Evidence:**

- [GitHub Actions CI Run #69](https://github.com/COMP313-T3/Software-Project-2/actions/runs/44608681173)
- `testing-evidence/iteration-2-github-actions-ci-passed.png`

The screenshot shows the successful GitHub Actions run for `release/iteration-2`, including the frontend and backend test jobs.

---

## Final Testing Summary

Overall, the Iteration 2 automated testing went well. We ran both the frontend and backend test suites locally and confirmed that all 4177 executed tests passed.

We also verified the updated release branch using GitHub Actions, where both test jobs completed successfully.

No failed automated tests were found during the final testing run. The results show that the features covered by the automated tests were working as expected after the Iteration 2 updates.

The next step is to finish the remaining manual checks, review the Pull Request, and merge `release/iteration-2` into `main` once everything is approved.
