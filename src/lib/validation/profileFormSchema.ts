import * as yup from "yup";

export type ProfileFormValues = {
  name: string;
  email: string;
};

export const profileFormSchema = yup.object({
  name: yup
    .string()
    .required("profile.data.errors.nameRequired")
    .min(2, "profile.data.errors.nameMin")
    .max(100, "profile.data.errors.nameMax"),
  email: yup
    .string()
    .required("profile.data.errors.emailRequired")
    .email("profile.data.errors.emailInvalid"),
});

export async function validateProfileForm(values: ProfileFormValues) {
  try {
    await profileFormSchema.validate(values, { abortEarly: false });
    return {
      valid: true,
      errors: {} as Partial<Record<keyof ProfileFormValues, string>>,
    };
  } catch (error) {
    if (!(error instanceof yup.ValidationError)) {
      throw error;
    }

    const errors: Partial<Record<keyof ProfileFormValues, string>> = {};

    error.inner.forEach((issue) => {
      if (!issue.path) return;
      const key = issue.path as keyof ProfileFormValues;
      if (!errors[key] && issue.message) {
        errors[key] = issue.message;
      }
    });

    return {
      valid: false,
      errors,
    };
  }
}
