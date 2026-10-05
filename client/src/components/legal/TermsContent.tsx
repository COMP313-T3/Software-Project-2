import { CONTACT_EMAIL, OPERATOR } from "../../content/legal.ts";
import { MINIMUM_AGE } from "../auth/authValidation.ts";
import LegalSection from "./LegalSection.tsx";

/**
 * Text of the Terms and Conditions, shared by the sign-up pop-up and the /terms page.
 */
export default function TermsContent() {
  return (
    <>
      <LegalSection title="About TopSend">
        <p>
          TopSend is a student project built by {OPERATOR}. It helps climbers
          find local bouldering competitions, register for them, keep
          scorecards, and follow live leaderboards. TopSend isn't a commercial
          service, and it may change, pause, or shut down at any time, for
          example when the course ends.
        </p>
      </LegalSection>

      <LegalSection title="Who can use TopSend">
        <p>
          You must be at least {MINIMUM_AGE} years old to create an account. If
          you're under 18, read these terms with a parent or guardian before you
          sign up. Younger climbers can take part through a youth profile that
          their gym creates with a guardian's consent.
        </p>
        <p>Give accurate information when you sign up, and keep it current.</p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Keep your password private and don't share your account. You're
          responsible for what happens under it. If you think someone else has
          used it, change your password and tell us right away. Each person gets
          one account.
        </p>
      </LegalSection>

      <LegalSection title="Roles">
        <ul>
          <li>
            Climbers find competitions, register for them, and follow their
            results.
          </li>
          <li>
            Gym Administrators set up and run their gym's competitions. A System
            Administrator approves each request for this access.
          </li>
          <li>System Administrators manage gyms, accounts, and settings.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Competitions and results">
        <p>
          Official results come from each competition's scoring rules and its
          organizers. Leaderboards update as results come in and can change
          until the organizers confirm them. Gyms are responsible for setting up
          their competitions accurately and for getting consent from any
          climbers they register.
        </p>
      </LegalSection>

      <LegalSection title="The AI Route Assistant">
        <p>
          The AI Route Assistant gives suggestions based on competition
          statistics. Its answers are for information only, can be wrong, and
          are never official results.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>When you use TopSend, don't:</p>
        <ul>
          <li>break the law or anyone else's rights;</li>
          <li>post false results or pretend to be someone else;</li>
          <li>copy data from TopSend with bots or scrapers;</li>
          <li>
            try to get around limits, security checks, or the reCAPTCHA; or
          </li>
          <li>interfere with TopSend or with other people's use of it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Climbing safety">
        <p>
          Climbing has risks. TopSend doesn't run or supervise gyms or
          competitions. Follow your gym's safety rules and its staff's
          instructions.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          TopSend is provided as is, with no promise that it will always be
          available, free of errors, or suited to a particular purpose. As far
          as the law allows, the TopSend team isn't responsible for losses that
          come from using it.
        </p>
      </LegalSection>

      <LegalSection title="Closing your account">
        <p>
          You can ask us to delete your account at any time by emailing us. We
          may suspend or close an account that breaks these terms.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We'll post each new version here with a new version number and date.
          If a change is important, we'll ask you to agree again before you keep
          using TopSend.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of Ontario and the federal laws
          of Canada that apply there.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </>
  );
}
