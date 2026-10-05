import { CONTACT_EMAIL, OPERATOR } from "../../content/legal.ts";
import { MINIMUM_AGE } from "../auth/authValidation.ts";
import LegalSection from "./LegalSection.tsx";

/**
 * Text of the Privacy Policy, shared by the sign-up pop-up and the /privacy page.
 */
export default function PrivacyContent() {
  return (
    <>
      <LegalSection title="Who we are">
        <p>
          TopSend is a student project by {OPERATOR}. We handle personal
          information under Canada's Personal Information Protection and
          Electronic Documents Act (PIPEDA). You can reach us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="What we collect and why">
        <ul>
          <li>
            Your name and email, to run your account, sign you in, and contact
            you about your account and the competitions you join.
          </li>
          <li>
            Your password, stored only as a one-way hash (argon2id), never as
            the password itself.
          </li>
          <li>
            Your date of birth, to confirm you're at least {MINIMUM_AGE} and to
            place you in age categories at competitions.
          </li>
          <li>
            Your gender, to place you in competition categories. You can choose
            Prefer not to say.
          </li>
          <li>
            Your phone number, so organizers can reach you about competitions
            you enter.
          </li>
          <li>
            Your address, postal code, and country, to keep accurate
            registration records and to suggest competitions near you.
          </li>
          <li>
            Your map location, only if you choose one from the address
            suggestions or the map, to suggest competitions near you.
          </li>
          <li>
            Your competition activity: registrations, scorecards, attempts, and
            results.
          </li>
          <li>
            Security records, such as sign-ins, failed sign-ins, and the IP
            addresses of requests, to protect accounts and limit abuse.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Your consent">
        <p>
          By creating an account, you agree to this policy. You can withdraw
          your consent at any time by asking us to delete your account.
        </p>
      </LegalSection>

      <LegalSection title="Climbers under 18">
        <p>
          You must be at least {MINIMUM_AGE} to create an account. If you're{" "}
          {MINIMUM_AGE} to 17, please read this policy with a parent or
          guardian. The full names of climbers under 18 never appear publicly.
          Younger climbers can take part only through a youth profile that their
          gym creates with a guardian's consent.
        </p>
      </LegalSection>

      <LegalSection title="Who can see your information">
        <ul>
          <li>You can see and update your own details.</li>
          <li>
            Organizers of a competition you join see what they need to run it,
            such as your name, categories, and results, and your phone number if
            they need to reach you.
          </li>
          <li>
            System Administrators can see account details to manage TopSend.
          </li>
          <li>
            Public leaderboards show your display name and results, never your
            contact details, address, date of birth, or map location.
          </li>
        </ul>
        <p>We never sell your information.</p>
      </LegalSection>

      <LegalSection title="Services we use">
        <ul>
          <li>MongoDB Atlas stores our database.</li>
          <li>
            Google reCAPTCHA checks that sign-ups come from people. Google's
            Privacy Policy and Terms of Service apply to it.
          </li>
          <li>
            Google Maps suggests addresses, looks up the address of the place or
            map spot you pick, shows the map for choosing your location, and
            will show where competitions are.
          </li>
          <li>Gmail sends account emails, such as email verification.</li>
          <li>
            Anthropic's Claude runs the AI Route Assistant. It receives
            competition statistics, not your contact details.
          </li>
          <li>Once TopSend is online, Netlify and Render will host it.</li>
        </ul>
        <p>
          Some of these services store or process data outside Canada, including
          in the United States.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          We keep your account details while your account is open. When you ask
          us to delete your account, we delete your personal information within
          30 days. Security records are kept for 90 days.
        </p>
      </LegalSection>

      <LegalSection title="How we protect it">
        <p>
          Passwords are hashed with argon2id, access is limited by role, and
          sign-ups and logins are rate limited. Once TopSend is online, every
          connection to it will be encrypted.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask to see, correct, or delete your personal information, or
          withdraw your consent, by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you're not
          satisfied with our answer, you can contact the Office of the Privacy
          Commissioner of Canada.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          TopSend uses only the cookies it needs to keep you signed in securely.
          Google reCAPTCHA and Google Maps may set their own cookies when they
          load.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We'll post each new version here with a new version number and date,
          and we'll ask you to agree again if a change is important.
        </p>
      </LegalSection>
    </>
  );
}
