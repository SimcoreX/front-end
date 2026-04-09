"use client";

import { PageTitle } from "@/components/content/PageTitle";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/classNames";
import { fetchFinancialNews, type FinancialNewsItem, type NewsSource, type NewsTopic } from "@/services/newsService";
import Image, { type ImageLoaderProps } from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const PAGE_SIZE = 10;

const passthroughLoader = ({ src }: ImageLoaderProps) => src;

export default function NewsPage() {
  const { t, i18n } = useTranslation();
  const [news, setNews] = useState<FinancialNewsItem[]>([]);
  const [page, setPage] = useState(1);
  const [topic, setTopic] = useState<NewsTopic>("all");
  const [hasNextPage, setHasNextPage] = useState(false);
  const [source, setSource] = useState<NewsSource>("backend");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [i18n.language, topic]);

  useEffect(() => {
    const controller = new AbortController();

    const loadNews = async () => {
      setIsLoading(true);
      setHasError(false);

      try {
        const result = await fetchFinancialNews({
          page,
          pageSize: PAGE_SIZE,
          language: i18n.language,
          topic,
          signal: controller.signal,
        });

        setNews(result.articles);
        setHasNextPage(result.hasNextPage);
        setSource(result.source);
      } catch {
        if (!controller.signal.aborted) {
          setHasError(true);
          setNews([]);
          setHasNextPage(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadNews();

    return () => {
      controller.abort();
    };
  }, [page, i18n.language, topic]);

  const topicOptions: Array<{ value: NewsTopic; label: string }> = [
    { value: "all", label: t("news.filters.all") },
    { value: "stocks", label: t("news.filters.stocks") },
    { value: "forex", label: t("news.filters.forex") },
    { value: "commodities", label: t("news.filters.commodities") },
  ];

  const canGoPrev = page > 1 && !isLoading;
  const canGoNext = hasNextPage && !isLoading;

  const sourceLabel = useMemo(() => {
    if (source === "backend") return t("news.source.backend");
    if (source === "gnews") return t("news.source.gnews");
    if (source === "mock") return t("news.source.mock");
    return source;
  }, [source, t]);

  return (
    <div className="flex flex-col gap-6 pb-2">
      <PageTitle>{t("news.title")}</PageTitle>

      <div className="rounded-2xl border border-primary-800/70 bg-primary-900/60 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-primary-200">{t("news.subtitle")}</p>
            <p className="text-lg font-semibold text-white">{t("news.latestLabel", { count: PAGE_SIZE })}</p>
          </div>

          <div className="rounded-full border border-primary-800 px-3 py-1 text-xs text-primary-200">
            {t("news.source.label")}: {isLoading ? <Skeleton as="span" className="ml-2 inline-block h-3 w-24 align-middle" /> : sourceLabel}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-300">{t("news.filters.label")}</span>
          {topicOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTopic(item.value)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                topic === item.value
                  ? "border-[#2E5C8A]/60 bg-[#2E5C8A]/20 text-white shadow-[0_8px_18px_rgba(46,92,138,0.25)]"
                  : "border-primary-800/80 bg-primary-950/50 text-primary-200 hover:border-primary-600/60 hover:text-white"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {hasError && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {t("news.errors.loadFailed")}
          </div>
        )}

        <div className="mt-5 space-y-3">
          {isLoading && <NewsListSkeleton />}

          {!isLoading && !news.length && (
            <div className="rounded-xl border border-primary-800/70 bg-primary-950/40 px-4 py-6 text-center text-sm text-primary-300">
              {t("news.empty", { topic: t(`news.filters.${topic}`) })}
            </div>
          )}

          {!isLoading &&
            news.map((article) => (
              <article
                key={article.id}
                className="rounded-2xl border border-primary-800/70 bg-primary-950/50 p-3 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="h-40 w-full shrink-0 overflow-hidden rounded-xl border border-primary-800/70 bg-primary-900/60 sm:h-28 sm:w-44">
                    <Image
                      loader={passthroughLoader}
                      unoptimized
                      src={article.imageUrl}
                      alt={article.title}
                      width={420}
                      height={260}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-tight text-white sm:text-lg">{article.title}</h2>

                    <p
                      className="mt-2 text-sm text-primary-200"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {article.summary || t("news.labels.noSummary")}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-primary-300">
                      <span>
                        {article.sourceName} · {formatPublishedDate(article.publishedAt, i18n.language)}
                      </span>
                      <a
                        href={article.articleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-primary-700/70 px-3 py-1 font-semibold text-primary-100 transition hover:border-primary-500/70 hover:text-white"
                      >
                        {t("news.actions.readMore")}
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-primary-200">{t("news.pagination.page", { page })}</p>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={!canGoPrev} onClick={() => setPage((current) => current - 1)}>
              {t("news.actions.previous")}
            </Button>
            <Button type="button" size="sm" variant="light" disabled={!canGoNext} onClick={() => setPage((current) => current + 1)}>
              {t("news.actions.next")}
            </Button>
          </div>
        </div>

        <p className={cn("mt-3 text-xs", source === "mock" ? "text-primary-200" : "text-primary-300")}>
          {source === "mock" ? t("news.source.mockHint") : t("news.source.liveHint")}
        </p>
      </div>
    </div>
  );
}

function NewsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`news-skeleton-${index}`}
          className="rounded-2xl border border-primary-800/70 bg-primary-950/50 p-3 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-40 w-full shrink-0 rounded-xl border-primary-800/70 sm:h-28 sm:w-44" />

            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-5/6 rounded" />
              <Skeleton className="mt-2 h-4 w-full rounded" />
              <Skeleton className="mt-2 h-4 w-3/4 rounded" />

              <div className="mt-3 flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-44 rounded" />
                <Skeleton className="h-7 w-24 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatPublishedDate(value: string, language: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  const locale = language.startsWith("pt") ? "pt-BR" : language.startsWith("es") ? "es-ES" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
