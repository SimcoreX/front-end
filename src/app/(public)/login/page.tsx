"use client";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { useAuthActions } from "@/hooks/useAuthActions";
import { isApiError } from "@/lib/types/api";
import { useAuthStore } from "@/stores/authStore";
import { Eye as EyeIcon, EyeSlash as EyeSlashIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";

type LoginFormState = {
  email: string;
  password: string;
};

const initialState: LoginFormState = {
  email: "",
  password: "",
};

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userStatus = useAuthStore((state) => state.userStatus);
  const { loginAction, isLoading } = useAuthActions();
  const [formState, setFormState] = useState<LoginFormState>(initialState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(
        userStatus?.toUpperCase() === "INACTIVE" ? "/profile?tab=subscription" : "/dashboard"
      );
    }
  }, [isAuthenticated, userStatus, router]);

  const handleChange =
    (field: keyof LoginFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    try {
      const session = await loginAction(formState);
      router.push(
        session.user?.status?.toUpperCase() === "INACTIVE" ? "/profile?tab=subscription" : "/dashboard"
      );
    } catch (error) {
      if (isApiError(error)) {
        const normalizedMessage = error.message.toLowerCase();
        const isInvalidCredentials =
          error.statusCode === 400 ||
          error.statusCode === 401 ||
          error.statusCode === 403 ||
          error.code === "INVALID_CREDENTIALS" ||
          normalizedMessage.includes("invalid credential") ||
          normalizedMessage.includes("invalid email") ||
          normalizedMessage.includes("invalid password") ||
          normalizedMessage.includes("unauthorized");

        if (isInvalidCredentials) {
          setErrorMessage(t("auth.errors.invalidCredentials"));
          return;
        }

        if (error.statusCode >= 400 && error.statusCode < 500) {
          setErrorMessage(t("auth.errors.invalidCredentials"));
          return;
        }

        setErrorMessage(t("auth.errors.generic"));
        return;
      }

      setErrorMessage(t("auth.errors.generic"));
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-6 py-12 text-white">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      >
        <source src="/market-movemente-video.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-primary-950/50 backdrop-blur-lg" />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex justify-center">
          <div className="h-40 w-72 overflow-hidden sm:h-44 sm:w-80 md:h-48 md:w-96">
          <Image
            src="/simcorex-logo.png"
            alt="Simcorex"
            width={320}
            height={96}
            className="h-full w-full object-cover object-center"
            priority
          />
          </div>
        </div>

        <div className="rounded-2xl border border-secondary-500/60 bg-primary-900/50 p-8 shadow-[0_0_40px_rgba(6,182,212,0.25)]">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold">
              {t("auth.title")}
            </h1>
            <p className="text-sm text-primary-200">{t("auth.subtitle")}</p>
          </div>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <TextField
              label={t("auth.emailLabel")}
              type="email"
              name="email"
              autoComplete="email"
              placeholder={t("auth.emailPlaceholder")}
              value={formState.email}
              onChange={handleChange("email")}
              required
            />
            <label className="flex flex-col gap-2 text-sm text-primary-100">
              <span className="font-medium">{t("auth.passwordLabel")}</span>
              <div className="relative">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={formState.password}
                  onChange={handleChange("password")}
                  required
                  className="w-full rounded-xl border border-secondary-500/40 bg-primary-900/60 px-4 py-3 pr-12 text-white placeholder:text-primary-400 outline-none transition focus:border-secondary-400 focus:ring-2 focus:ring-secondary-500/30"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-primary-300 transition hover:text-white"
                  aria-label={isPasswordVisible ? "Ocultar senha" : "Mostrar senha"}
                >
                  {isPasswordVisible ? (
                    <EyeSlashIcon size={18} weight="duotone" />
                  ) : (
                    <EyeIcon size={18} weight="duotone" />
                  )}
                </button>
              </div>
            </label>

            <Button
              type="submit"
              size="lg"
              isLoading={isLoading}
              disabled={!formState.email || !formState.password}
              className="mt-2"
            >
              {isLoading ? t("auth.loading") : t("auth.cta")}
            </Button>

            {errorMessage && (
              <p className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400">
                {errorMessage}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
