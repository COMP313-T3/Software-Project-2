import { useCallback, useRef, useState, type FormEvent } from "react";
import { fieldError, type FieldKind } from "./authValidation.ts";

/** One checked field in a sign-in or sign-up form. */
export interface AuthFieldSpec<Name extends string> {
  name: Name;
  label: string;
  kind: FieldKind;
}

function startingValues<Name extends string>(
  fields: readonly AuthFieldSpec<Name>[],
  initialValues: Partial<Record<Name, string>> = {},
) {
  return Object.fromEntries(
    fields.map((field) => [field.name, initialValues[field.name] ?? ""]),
  ) as Record<Name, string>;
}

/**
 * Holds the values and error messages of a sign-in or sign-up form. Checking shows each message
 * under its field and focuses the first field that needs fixing; a field's message clears as
 * soon as the user changes it.
 *
 * @param fields The checked fields, in the order they appear in the form.
 * @param onValid Called with the values when submit finds every field fine.
 * @param initialValues Values to start with, such as the email of an account just created.
 * @returns The values and messages, plus:
 *   change and inputRef to wire into each field;
 *   submit to check every field and send;
 *   check to check only some fields, such as one step of a longer form;
 *   showErrors to show the server's messages under their fields;
 *   reset to empty the form, and focus to move focus to a field.
 */
export function useAuthForm<Name extends string>(
  fields: readonly AuthFieldSpec<Name>[],
  onValid?: (values: Record<Name, string>) => void | Promise<void>,
  initialValues?: Partial<Record<Name, string>>,
) {
  const [values, setValues] = useState(() =>
    startingValues(fields, initialValues),
  );
  const [errors, setErrors] = useState<Partial<Record<Name, string>>>({});
  const elements = useRef(new Map<Name, HTMLElement>());

  function change(name: Name, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: "" }));
  }

  function inputRef(name: Name) {
    return (el: HTMLElement | null) => {
      if (el) elements.current.set(name, el);
      else elements.current.delete(name);
    };
  }

  const focus = useCallback((name: Name) => {
    elements.current.get(name)?.focus();
  }, []);

  function check(names?: readonly Name[]): boolean {
    const next: Partial<Record<Name, string>> = {};
    let firstInvalid: Name | null = null;
    for (const field of fields) {
      if (names && !names.includes(field.name)) continue;
      const message = fieldError(
        field.kind,
        field.label,
        values[field.name],
        values,
      );
      next[field.name] = message;
      if (message && firstInvalid === null) firstInvalid = field.name;
    }
    setErrors((current) => ({ ...current, ...next }));
    if (firstInvalid !== null) focus(firstInvalid);
    return firstInvalid === null;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (check()) void onValid?.(values);
  }

  function showErrors(messages: Readonly<Record<string, string>>) {
    const next: Partial<Record<Name, string>> = {};
    for (const field of fields) {
      if (messages[field.name]) next[field.name] = messages[field.name];
    }
    setErrors(next);
  }

  function reset() {
    setValues(startingValues(fields, initialValues));
    setErrors({});
  }

  return {
    values,
    errors,
    change,
    inputRef,
    submit,
    check,
    showErrors,
    reset,
    focus,
  };
}
