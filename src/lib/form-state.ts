/** Result of a form server action. `error`/`success` are message keys under the `forms` namespace. */
export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

export const initialFormState: FormState = {};
