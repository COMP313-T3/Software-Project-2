import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  isCountryCode,
} from "../../constants/countries.ts";
import { GENDER_OPTIONS } from "../../constants/genders.ts";
import { ApiError } from "../../lib/apiClient.ts";
import type { LatLngLiteral } from "../../lib/googleMaps.ts";
import { createClimberAccount } from "../../lib/usersApi.ts";
import AddressField from "./AddressField.tsx";
import styles from "./AuthForm.module.css";
import DateOfBirthField from "./DateOfBirthField.tsx";
import type { PinnedLocation } from "./MapPickerDialog.tsx";
import PasswordInput from "./PasswordInput.tsx";
import PasswordRules from "./PasswordRules.tsx";
import ReCaptchaBox, { type ReCaptchaBoxHandle } from "./ReCaptchaBox.tsx";
import StepProgress from "./StepProgress.tsx";
import TermsAgreement from "./TermsAgreement.tsx";
import { useAuthForm, type AuthFieldSpec } from "./useAuthForm.ts";

/** Values the create account form checks before sending. */
export interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  address: string;
  country: string;
  postalCode: string;
  password: string;
  confirmPassword: string;
}

type FieldName = keyof RegisterValues;

interface RegisterFormProps {
  /** Called with the email once the account has been created. */
  onCreated?: (email: string) => void;
}

const FIELDS: readonly AuthFieldSpec<FieldName>[] = [
  { name: "firstName", label: "First name", kind: "text" },
  { name: "lastName", label: "Last name", kind: "text" },
  { name: "email", label: "Email", kind: "email" },
  { name: "dateOfBirth", label: "Date of birth", kind: "date-of-birth" },
  { name: "phone", label: "Phone number", kind: "phone" },
  { name: "gender", label: "Gender", kind: "choice" },
  { name: "address", label: "Address", kind: "text" },
  { name: "country", label: "Country", kind: "country" },
  { name: "postalCode", label: "Postal code", kind: "postal-code" },
  { name: "password", label: "Password", kind: "new-password" },
  {
    name: "confirmPassword",
    label: "Confirm password",
    kind: "confirm-password",
  },
];

const STEPS: readonly { title: string; fields: readonly FieldName[] }[] = [
  { title: "Name and email", fields: ["firstName", "lastName", "email"] },
  { title: "About you", fields: ["dateOfBirth", "phone", "gender"] },
  { title: "Location", fields: ["address", "country", "postalCode"] },
  { title: "Password", fields: ["password", "confirmPassword"] },
  { title: "Finish", fields: [] },
];

const STEP_TITLES = STEPS.map((step) => step.title);
const LAST_STEP = STEPS.length - 1;
const STARTING_VALUES = { country: DEFAULT_COUNTRY };

const IDS: Record<FieldName, string> = {
  firstName: "firstName",
  lastName: "lastName",
  email: "registerEmail",
  dateOfBirth: "dateOfBirth",
  gender: "gender",
  phone: "phone",
  address: "address",
  country: "country",
  postalCode: "postalCode",
  password: "registerPassword",
  confirmPassword: "confirmPassword",
};

const TERMS_NEEDED = "Agree to the Terms and Privacy Policy to continue.";
const RECAPTCHA_NEEDED = "Check the box to show you're not a robot.";
const SENDING = "Creating your account...";
const UNEXPECTED = "Something went wrong. Please try again.";

function stepOf(field: string): number {
  if (field === "location") return 2;
  const index = STEPS.findIndex((step) =>
    step.fields.includes(field as FieldName),
  );
  return index === -1 ? LAST_STEP : index;
}

/**
 * Create account form for climbers, in five steps with a progress bar: name and email, about
 * you, location, password, and a last step with the Terms and the reCAPTCHA. Every step stays
 * in the page at the same height, so the card never changes size.
 */
export default function RegisterForm({ onCreated }: RegisterFormProps) {
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState<LatLngLiteral | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [recaptchaError, setRecaptchaError] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const recaptcha = useRef<ReCaptchaBoxHandle>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const termsBox = useRef<HTMLInputElement | null>(null);
  const { values, errors, change, inputRef, check, showErrors, reset, focus } =
    useAuthForm(FIELDS, undefined, STARTING_VALUES);

  function goTo(next: number, focusField?: FieldName) {
    flushSync(() => {
      setStep(next);
      setStatus("");
    });
    const target = focusField ?? STEPS[next].fields[0];
    if (target) focus(target);
    else termsBox.current?.focus();
  }

  function onTokenChange(token: string) {
    setRecaptchaToken(token);
    if (token) setRecaptchaError("");
  }

  function pin({
    location: pinned,
    address,
    country,
    postalCode,
  }: PinnedLocation) {
    setLocation(pinned);
    if (address) change("address", address);
    if (country && isCountryCode(country)) change("country", country);
    if (postalCode) change("postalCode", postalCode);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (step < LAST_STEP) {
      if (check(STEPS[step].fields)) goTo(step + 1);
      return;
    }

    setTermsError(acceptedTerms ? "" : TERMS_NEEDED);
    setRecaptchaError(recaptchaToken ? "" : RECAPTCHA_NEEDED);
    if (!acceptedTerms) termsBox.current?.focus();
    if (acceptedTerms && recaptchaToken) void send();
  }

  async function send() {
    setSending(true);
    setStatus(SENDING);
    const { confirmPassword: _confirmPassword, ...account } = values;
    try {
      await createClimberAccount({
        ...account,
        ...(location ? { location } : {}),
        acceptedTerms: true,
        recaptchaToken,
        website: honeypot.current?.value ?? "",
      });
      reset();
      recaptcha.current?.reset();
      setLocation(null);
      setAcceptedTerms(false);
      setStep(0);
      setStatus("");
      onCreated?.(values.email.trim());
    } catch (error) {
      recaptcha.current?.reset();
      showFailure(error);
    } finally {
      setSending(false);
    }
  }

  function showFailure(error: unknown) {
    if (!(error instanceof ApiError)) {
      setStatus(UNEXPECTED);
      return;
    }
    const fields = error.fields ?? {};
    const named = Object.keys(fields);
    if (named.length === 0) {
      setStatus(error.message);
      return;
    }

    showErrors(fields);
    setTermsError(fields.acceptedTerms ?? "");
    setRecaptchaError(fields.recaptchaToken ?? "");
    const target = Math.min(...named.map(stepOf));
    const firstField = STEPS[target].fields.find((name) => fields[name]);
    if (target === step) {
      setStatus(fields.location ?? "");
      if (firstField) focus(firstField);
      return;
    }
    goTo(target, firstField);
    setStatus(fields.location ?? "");
  }

  function errorFor(name: FieldName) {
    return (
      <span className={styles.error} id={`${IDS[name]}Error`}>
        {errors[name]}
      </span>
    );
  }

  function describe(name: FieldName) {
    return {
      "aria-describedby": `${IDS[name]}Error`,
      "aria-invalid": errors[name] ? true : undefined,
    };
  }

  function textField(
    name: FieldName,
    label: string,
    options: {
      type?: string;
      autoComplete: string;
      inputMode?: "text" | "email" | "tel";
      placeholder?: string;
    },
  ) {
    return (
      <div className={styles.field}>
        <label htmlFor={IDS[name]}>{label}</label>
        <input
          ref={inputRef(name)}
          id={IDS[name]}
          name={name}
          type={options.type ?? "text"}
          autoComplete={options.autoComplete}
          inputMode={options.inputMode}
          placeholder={options.placeholder}
          required
          value={values[name]}
          onChange={(event) => change(name, event.target.value)}
          {...describe(name)}
        />
        {errorFor(name)}
      </div>
    );
  }

  function selectField(
    name: FieldName,
    label: string,
    autoComplete: string,
    options: ReactNode,
  ) {
    return (
      <div className={styles.field}>
        <label htmlFor={IDS[name]}>{label}</label>
        <div className={styles.select}>
          <select
            ref={inputRef(name)}
            id={IDS[name]}
            name={name}
            autoComplete={autoComplete}
            required
            data-empty={!values[name]}
            value={values[name]}
            onChange={(event) => change(name, event.target.value)}
            {...describe(name)}
          >
            {options}
          </select>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>
        {errorFor(name)}
      </div>
    );
  }

  const stepContent = [
    <>
      <div className={styles.row}>
        {textField("firstName", "First name", { autoComplete: "given-name" })}
        {textField("lastName", "Last name", { autoComplete: "family-name" })}
      </div>
      {textField("email", "Email", {
        type: "email",
        autoComplete: "email",
        inputMode: "email",
        placeholder: "you@example.com",
      })}
    </>,
    <>
      <div className={`${styles.row} ${styles.rowDate}`}>
        <div className={styles.field}>
          <label id="dateOfBirthLabel" htmlFor="dateOfBirth">
            Date of birth
          </label>
          <DateOfBirthField
            id="dateOfBirth"
            labelId="dateOfBirthLabel"
            value={values.dateOfBirth}
            onChange={(value) => change("dateOfBirth", value)}
            invalid={Boolean(errors.dateOfBirth)}
            describedBy="dateOfBirthError"
            buttonRef={inputRef("dateOfBirth")}
          />
          {errorFor("dateOfBirth")}
        </div>
        {textField("phone", "Phone number", {
          type: "tel",
          autoComplete: "tel",
          inputMode: "tel",
          placeholder: "416 555 0123",
        })}
      </div>
      {selectField(
        "gender",
        "Gender",
        "sex",
        <>
          <option value="" disabled>
            Select
          </option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </>,
      )}
    </>,
    <>
      <AddressField
        value={values.address}
        onChange={(text) => {
          change("address", text);
          setLocation(null);
        }}
        onPinned={pin}
        location={location}
        error={errors.address}
        inputRef={inputRef("address")}
      />
      <div className={`${styles.row} ${styles.rowCountry}`}>
        {selectField(
          "country",
          "Country",
          "country",
          COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          )),
        )}
        {textField("postalCode", "Postal code", {
          autoComplete: "postal-code",
          placeholder: values.country === "US" ? "12345" : "A1A 1A1",
        })}
      </div>
    </>,
    <>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="registerPassword">Password</label>
          <PasswordInput
            ref={inputRef("password")}
            id="registerPassword"
            name="password"
            autoComplete="new-password"
            aria-describedby="registerPasswordRules registerPasswordError"
            aria-invalid={errors.password ? true : undefined}
            required
            value={values.password}
            onChange={(event) => change("password", event.target.value)}
          />
          {errorFor("password")}
        </div>
        <div className={styles.field}>
          <label htmlFor="confirmPassword">Confirm password</label>
          <PasswordInput
            ref={inputRef("confirmPassword")}
            id="confirmPassword"
            name="confirmPassword"
            revealLabel="confirm password"
            autoComplete="new-password"
            required
            value={values.confirmPassword}
            onChange={(event) => change("confirmPassword", event.target.value)}
            {...describe("confirmPassword")}
          />
          {errorFor("confirmPassword")}
        </div>
      </div>
      <PasswordRules id="registerPasswordRules" password={values.password} />
    </>,
    <>
      <TermsAgreement
        checked={acceptedTerms}
        onChange={(checked) => {
          setAcceptedTerms(checked);
          if (checked) setTermsError("");
        }}
        error={termsError}
        checkboxRef={(el) => {
          termsBox.current = el;
        }}
      />
      <div className={styles.field}>
        <ReCaptchaBox ref={recaptcha} onTokenChange={onTokenChange} />
        <span className={styles.error} id="recaptchaError" role="alert">
          {recaptchaError}
        </span>
      </div>
    </>,
  ];

  return (
    <form
      id="registerForm"
      className={styles.form}
      role="tabpanel"
      aria-labelledby="tabRegister"
      aria-busy={sending}
      noValidate
      onSubmit={onSubmit}
    >
      <StepProgress steps={STEP_TITLES} current={step} />
      <div className={styles.steps}>
        {stepContent.map((content, index) => (
          <fieldset
            key={STEP_TITLES[index]}
            className={styles.step}
            data-active={index === step}
            inert={index !== step}
            aria-hidden={index !== step || undefined}
          >
            <legend className={styles.visuallyHidden}>
              {STEP_TITLES[index]}
            </legend>
            {content}
          </fieldset>
        ))}
      </div>
      <div className={styles.hp} data-honeypot="" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          ref={honeypot}
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <p className={styles.status} id="registerStatus" role="status">
        {status}
      </p>
      <div className={styles.actions} data-first={step === 0}>
        {step > 0 && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => goTo(step - 1)}
          >
            Back
          </button>
        )}
        <button type="submit" className={styles.primary}>
          {step === LAST_STEP ? "Create account" : "Next"}
        </button>
      </div>
    </form>
  );
}
