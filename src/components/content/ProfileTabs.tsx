"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/classNames";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuthStore } from "@/stores/authStore";
import { useProfileFormStore } from "@/stores/profileFormStore";
import { getProfile, updateProfile, updateProfilePassword } from "@/lib/api/profile";
import { isApiError } from "@/lib/types/api";
import {
  cancelSubscription,
  getCurrentSubscription,
  getSubscriptionInvoices,
  renewSubscription,
} from "@/lib/api/subscription";
import type { SubscriptionCurrentResponse, SubscriptionInvoice } from "@/lib/types/subscription";
import { useSearchParams } from "next/navigation";

const tabs = [
  { key: "data", labelKey: "profile.tabs.data" },
  { key: "subscription", labelKey: "profile.tabs.subscription" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const SUBSCRIPTION_INVOICES_PAGE_SIZE = 3;

export function ProfileTabs() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("data");
  const userStatus = useAuthStore((state) => state.userStatus);
  const userEmail = useAuthStore((state) => state.userEmail) ?? "";
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const profileForm = useProfileFormStore((state) => state.values);
  const profileErrors = useProfileFormStore((state) => state.errors);
  const profileTouched = useProfileFormStore((state) => state.touched);
  const setProfileInitialValues = useProfileFormStore((state) => state.setInitialValues);
  const setProfileFieldValue = useProfileFormStore((state) => state.setFieldValue);
  const setProfileTouched = useProfileFormStore((state) => state.setTouched);
  const validateProfile = useProfileFormStore((state) => state.validate);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<"success" | "error" | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<"success" | "error" | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [subscriptionCurrent, setSubscriptionCurrent] = useState<SubscriptionCurrentResponse | null>(null);
  const [subscriptionInvoices, setSubscriptionInvoices] = useState<SubscriptionInvoice[]>([]);
  const [subscriptionInvoicesPage, setSubscriptionInvoicesPage] = useState(1);
  const [subscriptionInvoicesHasNextPage, setSubscriptionInvoicesHasNextPage] = useState(false);
  const [isLoadingSubscriptionInvoicesPage, setIsLoadingSubscriptionInvoicesPage] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [isRenewingSubscription, setIsRenewingSubscription] = useState(false);
  const [isCancelingSubscription, setIsCancelingSubscription] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const [subscriptionMessageStatus, setSubscriptionMessageStatus] = useState<"success" | "error" | null>(null);
  const [isCancelSubscriptionModalOpen, setIsCancelSubscriptionModalOpen] = useState(false);
  const [cancelSubscriptionPassword, setCancelSubscriptionPassword] = useState("");
  const [cancelSubscriptionPasswordError, setCancelSubscriptionPasswordError] = useState<string | null>(null);
  const clearSubscriptionMessageTimerRef = useRef<number | null>(null);

  const clearSubscriptionMessageTimer = useCallback(() => {
    if (clearSubscriptionMessageTimerRef.current !== null) {
      window.clearTimeout(clearSubscriptionMessageTimerRef.current);
      clearSubscriptionMessageTimerRef.current = null;
    }
  }, []);

  const updateAuthUserStatus = useCallback(
    (nextStatus: "ACTIVE" | "INACTIVE") => {
      if (!user) return;
      if (user.status?.toUpperCase() === nextStatus) return;
      setUser({
        ...user,
        status: nextStatus,
      });
    },
    [setUser, user]
  );

  const syncAuthUserFromBackend = useCallback(async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
    } catch {
      // Keep optimistic status if backend sync fails temporarily.
    }
  }, [setUser]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "subscription" || tabParam === "data") {
      setActiveTab(tabParam as TabKey);
      return;
    }

    if (userStatus?.toUpperCase() === "INACTIVE") {
      setActiveTab("subscription");
    }
  }, [searchParams, userStatus]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setIsLoadingProfile(true);

      try {
        const profile = await getProfile();
        if (cancelled) return;

        setUser(profile);
        setProfileInitialValues({
          name: profile.name ?? "",
          email: profile.email,
        });
      } catch {
        if (cancelled) return;

        setProfileInitialValues({
          name: user?.name ?? "",
          email: user?.email ?? userEmail,
        });
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [setProfileInitialValues, setUser, user?.email, user?.name, userEmail]);

  const loadSubscriptionData = useCallback(async (invoicePage = 1) => {
    setIsLoadingSubscription(true);
    setSubscriptionError(null);

    try {
      const [current, invoices] = await Promise.all([
        getCurrentSubscription(),
        getSubscriptionInvoices({ page: invoicePage, pageSize: SUBSCRIPTION_INVOICES_PAGE_SIZE }),
      ]);

      setSubscriptionCurrent(current);
      setSubscriptionInvoices(invoices.data ?? []);
      setSubscriptionInvoicesPage(invoices.page || invoicePage);
      setSubscriptionInvoicesHasNextPage(Boolean(invoices.hasNextPage));
    } catch {
      setSubscriptionCurrent(null);
      setSubscriptionInvoices([]);
      setSubscriptionInvoicesPage(1);
      setSubscriptionInvoicesHasNextPage(false);
      setSubscriptionError(t("profile.subscription.loadFailed"));
    } finally {
      setIsLoadingSubscription(false);
    }
  }, [t]);

  const loadSubscriptionInvoicesPage = useCallback(
    async (page: number) => {
      if (page < 1) return;

      setIsLoadingSubscriptionInvoicesPage(true);
      setSubscriptionError(null);

      try {
        const invoices = await getSubscriptionInvoices({
          page,
          pageSize: SUBSCRIPTION_INVOICES_PAGE_SIZE,
        });
        setSubscriptionInvoices(invoices.data ?? []);
        setSubscriptionInvoicesPage(invoices.page || page);
        setSubscriptionInvoicesHasNextPage(Boolean(invoices.hasNextPage));
      } catch {
        setSubscriptionError(t("profile.subscription.loadFailed"));
      } finally {
        setIsLoadingSubscriptionInvoicesPage(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (activeTab !== "subscription") return;
    loadSubscriptionData();
  }, [activeTab, loadSubscriptionData]);

  useEffect(
    () => () => {
      clearSubscriptionMessageTimer();
    },
    [clearSubscriptionMessageTimer]
  );

  const handleRenewSubscription = async () => {
    clearSubscriptionMessageTimer();
    setIsRenewingSubscription(true);
    setSubscriptionMessage(null);
    setSubscriptionMessageStatus(null);

    try {
      await renewSubscription();
      setSubscriptionMessageStatus("success");
      setSubscriptionMessage(t("profile.subscription.renewSuccess"));
      updateAuthUserStatus("ACTIVE");
      await loadSubscriptionData();
      await syncAuthUserFromBackend();
    } catch (error) {
      setSubscriptionMessageStatus("error");

      if (isApiError(error)) {
        if (error.code === "SUBSCRIPTION_ALREADY_ACTIVE_RENEWED") {
          setSubscriptionMessage(t("profile.subscription.renewConflict"));
        } else if (error.code === "PAYMENT_REQUIRED") {
          setSubscriptionMessage(t("profile.subscription.paymentRequired"));
        } else {
          setSubscriptionMessage(t("profile.subscription.actionFailed"));
        }
      } else {
        setSubscriptionMessage(t("profile.subscription.actionFailed"));
      }
    } finally {
      setIsRenewingSubscription(false);
    }
  };

  const openCancelSubscriptionModal = () => {
    setCancelSubscriptionPassword("");
    setCancelSubscriptionPasswordError(null);
    setIsCancelSubscriptionModalOpen(true);
  };

  const closeCancelSubscriptionModal = () => {
    if (isCancelingSubscription) return;
    setIsCancelSubscriptionModalOpen(false);
    setCancelSubscriptionPassword("");
    setCancelSubscriptionPasswordError(null);
  };

  const handleCancelSubscription = async () => {
    if (!cancelSubscriptionPassword.trim()) {
      setCancelSubscriptionPasswordError(t("profile.subscription.cancelModal.passwordRequired"));
      return;
    }

    clearSubscriptionMessageTimer();
    setIsCancelingSubscription(true);
    setSubscriptionMessage(null);
    setSubscriptionMessageStatus(null);
    setCancelSubscriptionPasswordError(null);

    try {
      await cancelSubscription({ password: cancelSubscriptionPassword.trim() });
      setSubscriptionMessageStatus("success");
      setSubscriptionMessage(t("profile.subscription.cancelSuccess"));
      updateAuthUserStatus("INACTIVE");
      setIsCancelSubscriptionModalOpen(false);
      setCancelSubscriptionPassword("");
      setCancelSubscriptionPasswordError(null);
      clearSubscriptionMessageTimerRef.current = window.setTimeout(() => {
        setSubscriptionMessage(null);
        setSubscriptionMessageStatus(null);
        clearSubscriptionMessageTimerRef.current = null;
      }, 10000);
      await loadSubscriptionData();
      await syncAuthUserFromBackend();
    } catch (error) {
      if (
        isApiError(error) &&
        (error.code === "INVALID_CURRENT_PASSWORD" ||
          error.statusCode === 401 ||
          String(error.message).toLowerCase().includes("password"))
      ) {
        setCancelSubscriptionPasswordError(t("profile.subscription.cancelModal.incorrectPassword"));
      } else {
        setSubscriptionMessageStatus("error");
        setSubscriptionMessage(t("profile.subscription.actionFailed"));
      }
    } finally {
      setIsCancelingSubscription(false);
    }
  };

  const submitProfile = async () => {
    setIsSavingProfile(true);
    setProfileMessage(null);
    setProfileStatus(null);

    const isValid = await validateProfile();
    if (!isValid) {
      setIsSavingProfile(false);
      return;
    }

    try {
      const updated = await updateProfile({
        name: profileForm.name.trim(),
      });

      setUser(updated);
      setProfileInitialValues({
        name: updated.name ?? "",
        email: updated.email,
      });
      setProfileStatus("success");
      setProfileMessage(t("profile.data.profileUpdated"));
    } catch {
      setProfileStatus("error");
      setProfileMessage(t("profile.data.profileUpdateFailed"));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordField = (field: keyof typeof passwordForm) =>
    (value: string) => {
      setPasswordMessage(null);
      setPasswordStatus(null);
      setPasswordForm((prev) => ({ ...prev, [field]: value }));
    };

  const submitPasswordChange = async () => {
    setIsSavingPassword(true);
    setPasswordMessage(null);
    setPasswordStatus(null);

    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setIsSavingPassword(false);
      setPasswordStatus("error");
      setPasswordMessage(t("profile.data.passwordUpdateFailed"));
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setIsSavingPassword(false);
      setPasswordStatus("error");
      setPasswordMessage(t("profile.data.passwordMismatch"));
      return;
    }

    try {
      await updateProfilePassword({
        currentPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });

      setPasswordStatus("success");
      setPasswordMessage(t("profile.data.passwordUpdated"));
      setShowPasswordForm(false);
      setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      setPasswordStatus("error");

      if (isApiError(error)) {
        if (error.code === "INVALID_CURRENT_PASSWORD") {
          setPasswordMessage(t("profile.data.invalidCurrentPassword"));
        } else if (error.code === "PASSWORD_NOT_CHANGED") {
          setPasswordMessage(t("profile.data.passwordNotChanged"));
        } else {
          setPasswordMessage(t("profile.data.passwordUpdateFailed"));
        }
      } else {
        setPasswordMessage(t("profile.data.passwordUpdateFailed"));
      }
    } finally {
      setIsSavingPassword(false);
    }
  };

  const subscriptionStatus = subscriptionCurrent?.status?.toLowerCase();
  const isSubscriptionCancelled = subscriptionStatus === "cancelled" || subscriptionStatus === "canceled";
  const canGoToPrevInvoicesPage =
    subscriptionInvoicesPage > 1 && !isLoadingSubscription && !isLoadingSubscriptionInvoicesPage;
  const canGoToNextInvoicesPage =
    subscriptionInvoicesHasNextPage && !isLoadingSubscription && !isLoadingSubscriptionInvoicesPage;

  return (
    <div className="overflow-hidden rounded-2xl border border-primary-800/70 bg-primary-900/50 shadow-[0_6px_18px_rgba(0,0,0,0.18)]">
      <div className="flex gap-3 bg-primary-950/80 px-3 pt-3">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 border-b-2 pb-2 text-sm font-semibold transition",
                isActive
                  ? "text-white border-secondary-500"
                  : "text-primary-300 border-transparent hover:text-white hover:border-primary-500"
              )}
              aria-pressed={isActive}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="p-6">
        {activeTab === "data" && (
          <div className="space-y-6 text-sm text-primary-100">
            <div className="space-y-2">
              <p className="font-semibold text-white">{t("profile.tabs.dataHeading")}</p>
              <p className="text-primary-200">{t("profile.tabs.dataDescription")}</p>
            </div>

            {isLoadingProfile ? (
              <ProfileDataSkeleton />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    label={t("profile.data.name")}
                    name="name"
                    placeholder={t("profile.data.namePlaceholder")}
                    value={profileForm.name}
                    onChange={(e) => setProfileFieldValue("name", e.target.value)}
                    onBlur={() => setProfileTouched("name", true)}
                    autoComplete="name"
                  />
                  <TextField
                    label={t("profile.data.email")}
                    name="email"
                    type="email"
                    value={profileForm.email}
                    readOnly
                    disabled
                    placeholder={t("profile.data.emailPlaceholder")}
                    autoComplete="email"
                  />
                </div>

                {profileTouched.name && profileErrors.name && (
                  <p className="-mt-2 text-sm text-red-400">{t(profileErrors.name)}</p>
                )}

                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="sm:flex-1">
                      <TextField
                        label={t("profile.data.password")}
                        name="password"
                        type="password"
                        value="••••••••"
                        readOnly
                        disabled
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="border border-primary-500/60 hover:border-primary-300"
                      onClick={() => setShowPasswordForm((prev) => !prev)}
                    >
                      {t("profile.data.changePassword")}
                    </Button>
                  </div>

                  {showPasswordForm && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <TextField
                          label={t("profile.data.oldPassword")}
                          name="oldPassword"
                          type="password"
                          value={passwordForm.oldPassword}
                          onChange={(e) => handlePasswordField("oldPassword")(e.target.value)}
                          placeholder={t("profile.data.oldPasswordPlaceholder")}
                          autoComplete="current-password"
                        />
                        <TextField
                          label={t("profile.data.newPassword")}
                          name="newPassword"
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={(e) => handlePasswordField("newPassword")(e.target.value)}
                          placeholder={t("profile.data.newPasswordPlaceholder")}
                          autoComplete="new-password"
                        />
                        <TextField
                          label={t("profile.data.confirmPassword")}
                          name="confirmPassword"
                          type="password"
                          value={passwordForm.confirmPassword}
                          onChange={(e) => handlePasswordField("confirmPassword")(e.target.value)}
                          placeholder={t("profile.data.confirmPasswordPlaceholder")}
                          autoComplete="new-password"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="primary"
                          isLoading={isSavingPassword}
                          onClick={submitPasswordChange}
                          disabled={isSavingPassword}
                          className="border border-primary-500/60 hover:border-primary-300"
                        >
                          {isSavingPassword
                            ? t("profile.data.savingPassword")
                            : t("profile.data.savePassword")}
                        </Button>
                        {passwordMessage && (
                          <span
                            className={cn(
                              "text-sm",
                              passwordStatus === "success"
                                ? "text-green-400"
                                : "text-red-400"
                            )}
                          >
                            {passwordMessage}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    type="button"
                    variant="light"
                    size="sm"
                    isLoading={isSavingProfile}
                    onClick={submitProfile}
                    disabled={isSavingProfile || isLoadingProfile}
                    className="bg-white text-black hover:bg-white/90 border border-white px-4 py-2 text-sm"
                  >
                    {isSavingProfile
                      ? t("profile.data.savingProfile")
                      : t("profile.data.saveProfile")}
                  </Button>
                  {profileMessage && (
                    <span
                      className={cn(
                        "text-sm",
                        profileStatus === "success" ? "text-green-400" : "text-red-400"
                      )}
                    >
                      {profileMessage}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "subscription" && (
          <div className="space-y-4 text-sm text-primary-100">
            <div className="space-y-2">
              <p className="font-semibold text-white">{t("profile.tabs.subscriptionHeading")}</p>
              <p className="text-primary-200">{t("profile.tabs.subscriptionDescription")}</p>
            </div>

            {isLoadingSubscription ? (
              <SubscriptionSkeleton />
            ) : (
              <>
                {subscriptionError && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {subscriptionError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4">
                    <p className="text-primary-300">{t("profile.subscription.plan")}</p>
                    <p className="text-lg font-semibold text-white">{subscriptionCurrent?.plan ?? "--"}</p>
                  </div>
                  <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4">
                    <p className="text-primary-300">{t("profile.subscription.price")}</p>
                    <p className="text-lg font-semibold text-white">{formatCurrency(subscriptionCurrent?.price)}</p>
                  </div>
                  <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4">
                    <p className="text-primary-300">{t("profile.subscription.renewsIn")}</p>
                    <p className="text-lg font-semibold text-white">
                      {typeof subscriptionCurrent?.renewsInDays === "number"
                        ? t("profile.subscription.renewsInDays", { count: subscriptionCurrent.renewsInDays })
                        : "--"}
                    </p>
                    <p className="text-xs text-primary-300">
                      {t("profile.subscription.renewDate")}: {formatDate(subscriptionCurrent?.renewDate)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-primary-300">{t("profile.subscription.status")}</span>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          isSubscriptionCancelled
                            ? "bg-red-500/12 text-red-300"
                            : "bg-green-500/10 text-green-300"
                        )}
                      >
                        {subscriptionCurrent?.status
                          ? t(`profile.subscription.statusValue.${subscriptionCurrent.status.toLowerCase()}`, {
                              defaultValue: subscriptionCurrent.status,
                            })
                          : "--"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-primary-200">
                      <span>{t("profile.subscription.paymentMethod")}</span>
                      <span className="font-medium text-white">{formatPaymentMethod(subscriptionCurrent?.paymentMethod)}</span>
                    </div>
                    <div className="flex items-center justify-between text-primary-200">
                      <span>{t("profile.subscription.nextInvoice")}</span>
                      <span className="font-medium text-white">{formatCurrency(subscriptionCurrent?.nextInvoiceAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-primary-200">
                      <span>{t("profile.subscription.lastPayment")}</span>
                      <span className="font-medium text-white">{formatDate(subscriptionCurrent?.lastPaymentDate)}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4">
                    <p className="mb-3 text-primary-300">{t("profile.subscription.invoicesTitle")}</p>
                    <div className="space-y-2">
                      {isLoadingSubscriptionInvoicesPage &&
                        Array.from({ length: SUBSCRIPTION_INVOICES_PAGE_SIZE }).map((_, index) => (
                          <Skeleton key={`subscription-invoices-page-loading-${index}`} className="h-14 w-full rounded-lg" />
                        ))}
                      {!isLoadingSubscriptionInvoicesPage && !subscriptionInvoices.length && (
                        <p className="text-sm text-primary-300">{t("profile.subscription.invoicesEmpty")}</p>
                      )}
                      {!isLoadingSubscriptionInvoicesPage &&
                        subscriptionInvoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="flex items-center justify-between rounded-lg border border-primary-800/60 bg-primary-950/60 px-3 py-2"
                        >
                          <div>
                            <p className="font-semibold text-white">{invoice.id}</p>
                            <p className="text-xs text-primary-300">{formatDate(invoice.date)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-white">{formatCurrency(invoice.amount)}</p>
                            <p className="text-xs text-green-300">
                              {t(`profile.subscription.invoiceStatus.${invoice.status.toLowerCase()}`, {
                                defaultValue: invoice.status,
                              })}
                            </p>
                          </div>
                        </div>
                        ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-primary-300">
                        {t("profile.subscription.invoicesPage", { page: subscriptionInvoicesPage })}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => loadSubscriptionInvoicesPage(subscriptionInvoicesPage - 1)}
                          disabled={!canGoToPrevInvoicesPage}
                        >
                          {t("profile.subscription.invoicesPrevious")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="light"
                          onClick={() => loadSubscriptionInvoicesPage(subscriptionInvoicesPage + 1)}
                          disabled={!canGoToNextInvoicesPage}
                        >
                          {t("profile.subscription.invoicesNext")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="light"
                size="sm"
                onClick={handleRenewSubscription}
                isLoading={isRenewingSubscription}
                disabled={isRenewingSubscription || isCancelingSubscription || isLoadingSubscription}
                className="bg-white text-black hover:bg-white/90 border border-white px-4 py-2 text-sm"
              >
                {t("profile.subscription.renewNow")}
              </Button>
              {!isSubscriptionCancelled && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openCancelSubscriptionModal}
                  disabled={isRenewingSubscription || isCancelingSubscription || isLoadingSubscription}
                  className="bg-red-600 text-white border-red-600 hover:bg-red-500 hover:border-red-500 px-4 py-2 text-sm"
                >
                  {t("profile.subscription.cancel")}
                </Button>
              )}
              {subscriptionMessage && (
                <span
                  className={cn(
                    "text-sm",
                    subscriptionMessageStatus === "success" ? "text-green-400" : "text-red-400"
                  )}
                >
                  {subscriptionMessage}
                </span>
              )}
            </div>

            {isCancelSubscriptionModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-[1px] sm:p-5">
                <div className="mx-auto flex w-full max-w-md flex-col rounded-2xl border border-primary-800/70 bg-primary-900 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                  <div className="mb-4">
                    <p className="text-lg font-semibold text-white">
                      {t("profile.subscription.cancelModal.title")}
                    </p>
                    <p className="text-sm text-primary-200">
                      {t("profile.subscription.cancelModal.description")}
                    </p>
                  </div>

                  <TextField
                    label={t("profile.subscription.cancelModal.passwordLabel")}
                    name="cancelSubscriptionPassword"
                    type="password"
                    value={cancelSubscriptionPassword}
                    onChange={(event) => {
                      setCancelSubscriptionPassword(event.target.value);
                      if (cancelSubscriptionPasswordError) {
                        setCancelSubscriptionPasswordError(null);
                      }
                    }}
                    placeholder={t("profile.subscription.cancelModal.passwordPlaceholder")}
                    autoComplete="current-password"
                  />

                  {cancelSubscriptionPasswordError && (
                    <p className="mt-2 text-sm text-red-300">{cancelSubscriptionPasswordError}</p>
                  )}

                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="light"
                      onClick={closeCancelSubscriptionModal}
                      disabled={isCancelingSubscription}
                    >
                      {t("profile.subscription.cancelModal.back")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCancelSubscription}
                      isLoading={isCancelingSubscription}
                      disabled={isCancelingSubscription}
                      className="bg-red-600 text-white border-red-600 hover:bg-red-500 hover:border-red-500"
                    >
                      {t("profile.subscription.cancelModal.confirm")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileDataSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-12.5 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-12.5 w-full rounded-xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-12.5 w-full rounded-xl" />
      </div>

      <div className="pt-2">
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}

function SubscriptionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`subscription-top-skeleton-${index}`}
            className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4"
          >
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="mt-3 h-7 w-24 rounded" />
            <Skeleton className="mt-3 h-3 w-28 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`subscription-status-skeleton-${index}`} className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 p-4 space-y-3">
          <Skeleton className="h-4 w-40 rounded" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`subscription-invoice-skeleton-${index}`} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function formatPaymentMethod(value?: string) {
  if (!value) return "--";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
