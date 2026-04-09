"use client";

import { validateProfileForm, type ProfileFormValues } from "@/lib/validation/profileFormSchema";
import { create } from "zustand";

type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

type ProfileFormState = {
  values: ProfileFormValues;
  errors: ProfileFormErrors;
  touched: Partial<Record<keyof ProfileFormValues, boolean>>;
  setInitialValues: (values: ProfileFormValues) => void;
  setFieldValue: <TField extends keyof ProfileFormValues>(
    field: TField,
    value: ProfileFormValues[TField]
  ) => void;
  setTouched: (field: keyof ProfileFormValues, touched?: boolean) => void;
  validate: () => Promise<boolean>;
  clearErrors: () => void;
};

const initialValues: ProfileFormValues = {
  name: "",
  email: "",
};

export const useProfileFormStore = create<ProfileFormState>((set, get) => ({
  values: initialValues,
  errors: {},
  touched: {},
  setInitialValues: (values) =>
    set({
      values,
      errors: {},
      touched: {},
    }),
  setFieldValue: (field, value) =>
    set((state) => ({
      values: {
        ...state.values,
        [field]: value,
      },
      errors: {
        ...state.errors,
        [field]: undefined,
      },
    })),
  setTouched: (field, touched = true) =>
    set((state) => ({
      touched: {
        ...state.touched,
        [field]: touched,
      },
    })),
  validate: async () => {
    const { values } = get();
    const result = await validateProfileForm(values);
    set({ errors: result.errors });
    return result.valid;
  },
  clearErrors: () => set({ errors: {} }),
}));
