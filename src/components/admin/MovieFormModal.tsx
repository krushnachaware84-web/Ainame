import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Upload, Wand2 } from 'lucide-react';
import type {
  AgeRating,
  GenreItem,
  MovieItem,
  SubscriptionPlan,
  SubtitleTrack,
  TitleStatus,
  TitleType,
  VideoSource,
} from '../../types/streaming';
import { formatMonthlyPrice, slugify, validateMovieDraft } from '../../utils/catalog';
import { detectVideoSourceType } from '../../utils/youtube';
import { uploadFileWithProgress } from '../../lib/firebase';
import { Modal } from '../ui/Modal';

interface MovieFormModalProps {
  open: boolean;
  initialMovie: MovieItem | null;
  genres: GenreItem[];
  plans: SubscriptionPlan[];
  tmdbApiKey?: string;
  onClose: () => void;
  onSave: (movie: MovieItem, isNew: boolean) => Promise<void>;
}

const createEmptyMovie = (): MovieItem => {
  const now = new Date().toISOString();
  return {
    id: `title-${Date.now()}`,
    title: '',
    slug: '',
    type: 'movie',
    description: '',
    releaseYear: 2026,
    duration: 110,
    rating: 8.0,
    ageRating: 'PG-13',
    language: 'English',
    country: 'United States',
    genres: ['Drama'],
    cast: [],
    director: '',
    tags: [],
    posterUrl: '/src/assets/images/poster_solaris_drift_1794830225596.jpg',
    bannerUrl: '/src/assets/images/hero_solaris_drift_1794830225360.jpg',
    trailerUrl: '',
    videoSources: [{ label: '1080p HD', url: '', type: 'mp4' }],
    subtitles: [],
    isFeatured: false,
    isTrending: false,
    isPremium: false,
    requiresSignIn: false,
    requiredPlanId: null,
    requiredPlanName: null,
    status: 'published',
    views: 0,
    likesCount: 0,
    createdAt: now,
    updatedAt: now,
  };
};

export function MovieFormModal({
  open,
  initialMovie,
  genres,
  plans,
  tmdbApiKey,
  onClose,
  onSave,
}: MovieFormModalProps) {
  const isNew = !initialMovie;
  const [draft, setDraft] = useState<MovieItem>(() => initialMovie ?? createEmptyMovie());
  const [castInput, setCastInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<{ field: string; pct: number } | null>(null);
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbLoading, setTmdbLoading] = useState(false);

  useEffect(() => {
    const base = initialMovie ?? createEmptyMovie();
    setDraft(base);
    setCastInput(base.cast.join(', '));
    setTagsInput(base.tags.join(', '));
    setErrors({});
  }, [initialMovie, open]);

  const handleUpload = async (field: 'posterUrl' | 'bannerUrl', file: File) => {
    const folder = field === 'posterUrl' ? 'posters' : 'banners';
    setUploadPct({ field, pct: 0 });
    try {
      const url = await uploadFileWithProgress(
        `${folder}/${draft.id}-${Date.now()}-${file.name}`,
        file,
        (pct) => setUploadPct({ field, pct })
      );
      setDraft((d) => ({ ...d, [field]: url }));
    } finally {
      setUploadPct(null);
    }
  };

  const handleTmdbAutofill = async () => {
    if (!tmdbApiKey || !tmdbQuery.trim()) return;
    setTmdbLoading(true);
    try {
      const endpoint = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(
        tmdbApiKey
      )}&query=${encodeURIComponent(tmdbQuery.trim())}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      const first = data?.results?.[0];
      if (first) {
        const title = first.title || first.name || draft.title;
        const yearStr = (first.release_date || first.first_air_date || '').slice(0, 4);
        setDraft((d) => ({
          ...d,
          title,
          slug: isNew ? slugify(title) : d.slug,
          type: first.media_type === 'tv' ? 'series' : 'movie',
          description: first.overview || d.description,
          releaseYear: yearStr ? Number(yearStr) : d.releaseYear,
          rating: typeof first.vote_average === 'number' ? Number(first.vote_average.toFixed(1)) : d.rating,
          posterUrl: first.poster_path
            ? `https://image.tmdb.org/t/p/w500${first.poster_path}`
            : d.posterUrl,
          bannerUrl: first.backdrop_path
            ? `https://image.tmdb.org/t/p/original${first.backdrop_path}`
            : d.bannerUrl,
        }));
      }
    } finally {
      setTmdbLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prepared: MovieItem = {
      ...draft,
      cast: castInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      tags: tagsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      videoSources: draft.videoSources.filter((v) => v.url.trim() || v.label.trim()),
      subtitles: draft.subtitles.filter((s) => s.label.trim()),
      updatedAt: new Date().toISOString(),
    };

    const validation = validateMovieDraft(prepared);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setSaving(true);
    try {
      await onSave(prepared, isNew);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const updateSource = (idx: number, patch: Partial<VideoSource>) => {
    setDraft((d) => ({
      ...d,
      videoSources: d.videoSources.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const updateSubtitle = (idx: number, patch: Partial<SubtitleTrack>) => {
    setDraft((d) => ({
      ...d,
      subtitles: d.subtitles.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'Add Movie or Series' : `Edit: ${draft.title}`}
      maxWidthClass="max-w-5xl"
    >
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Optional TMDB Auto-Fill */}
          {tmdbApiKey && (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <input
                type="text"
                value={tmdbQuery}
                onChange={(e) => setTmdbQuery(e.target.value)}
                placeholder="Search TMDB title to auto-fill metadata..."
                className="flex-1 bg-transparent text-xs outline-none"
              />
              <button
                type="button"
                disabled={tmdbLoading}
                onClick={handleTmdbAutofill}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-950"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {tmdbLoading ? 'Fetching...' : 'Auto-fill'}
              </button>
            </div>
          )}

          {/* Basic Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Title *</label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    title,
                    slug: isNew ? slugify(title) : d.slug,
                  }));
                }}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
              {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">URL Slug *</label>
              <input
                type="text"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700"
              />
              {errors.slug && <p className="mt-1 text-xs text-rose-500">{errors.slug}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Type</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as TitleType }))}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="movie">Movie</option>
                <option value="series">Series</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Year</label>
                <input
                  type="number"
                  value={draft.releaseYear}
                  onChange={(e) => setDraft((d) => ({ ...d, releaseYear: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-2.5 py-2 text-sm tabular-nums dark:border-zinc-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Mins</label>
                <input
                  type="number"
                  value={draft.duration}
                  onChange={(e) => setDraft((d) => ({ ...d, duration: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-2.5 py-2 text-sm tabular-nums dark:border-zinc-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Rating</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={10}
                  value={draft.rating}
                  onChange={(e) => setDraft((d) => ({ ...d, rating: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-2.5 py-2 text-sm tabular-nums dark:border-zinc-700"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Age Rating</label>
              <select
                value={draft.ageRating}
                onChange={(e) => setDraft((d) => ({ ...d, ageRating: e.target.value as AgeRating }))}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {['G', 'PG', 'PG-13', 'R', 'TV-MA'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Language</label>
                <input
                  type="text"
                  value={draft.language}
                  onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Director</label>
                <input
                  type="text"
                  value={draft.director}
                  onChange={(e) => setDraft((d) => ({ ...d, director: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Synopsis *</label>
            <textarea
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-rose-500">{errors.description}</p>
            )}
          </div>

          {/* Media URLs & Storage Upload */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Poster URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.posterUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, posterUrl: e.target.value }))}
                  className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs dark:border-zinc-700"
                />
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <Upload className="h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload('posterUrl', f);
                    }}
                  />
                </label>
              </div>
              {uploadPct?.field === 'posterUrl' && (
                <p className="mt-1 text-[11px] text-zinc-500">Uploading {uploadPct.pct}%</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Banner URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.bannerUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, bannerUrl: e.target.value }))}
                  className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-xs dark:border-zinc-700"
                />
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <Upload className="h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload('bannerUrl', f);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Video Sources */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500">Video Sources</span>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    videoSources: [...d.videoSources, { label: '720p', url: '', type: 'mp4' }],
                  }))
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--kv-accent,#e50914)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Source
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Paste a YouTube link (watch, youtu.be, shorts, embed), MP4, or HLS (.m3u8) URL. YouTube links play inside KinoVault&apos;s custom player without YouTube controls or end-screen suggestions.
            </p>
            {draft.videoSources.map((src, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  placeholder="1080p"
                  value={src.label}
                  onChange={(e) => updateSource(idx, { label: e.target.value })}
                  className="col-span-3 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
                />
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=... or .mp4"
                  value={src.url}
                  onChange={(e) => {
                    const nextUrl = e.target.value;
                    updateSource(idx, {
                      url: nextUrl,
                      type: detectVideoSourceType(nextUrl, src.type),
                    });
                  }}
                  className="col-span-6 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
                />
                <select
                  value={src.type}
                  onChange={(e) =>
                    updateSource(idx, { type: e.target.value as VideoSource['type'] })
                  }
                  className="col-span-2 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="mp4">MP4</option>
                  <option value="hls">HLS</option>
                  <option value="embed">YouTube / Embed</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      videoSources: d.videoSources.filter((_, i) => i !== idx),
                    }))
                  }
                  aria-label="Remove source"
                  className="col-span-1 flex items-center justify-center text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Subtitles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500">Subtitles (VTT)</span>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    subtitles: [...d.subtitles, { lang: 'en', label: 'English', url: '' }],
                  }))
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--kv-accent,#e50914)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Subtitle
              </button>
            </div>
            {draft.subtitles.map((sub, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  placeholder="en"
                  value={sub.lang}
                  onChange={(e) => updateSubtitle(idx, { lang: e.target.value })}
                  className="col-span-2 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
                />
                <input
                  type="text"
                  placeholder="English"
                  value={sub.label}
                  onChange={(e) => updateSubtitle(idx, { label: e.target.value })}
                  className="col-span-3 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
                />
                <input
                  type="url"
                  placeholder="https://.../subs.vtt"
                  value={sub.url}
                  onChange={(e) => updateSubtitle(idx, { url: e.target.value })}
                  className="col-span-6 rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      subtitles: d.subtitles.filter((_, i) => i !== idx),
                    }))
                  }
                  aria-label="Remove subtitle"
                  className="col-span-1 flex items-center justify-center text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Genres, Cast, Tags */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-zinc-500">Genres *</span>
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => {
                const selected = draft.genres.includes(g.name);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        genres: selected
                          ? d.genres.filter((x) => x !== g.name)
                          : [...d.genres, g.name],
                      }))
                    }
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-[var(--kv-accent,#e50914)] bg-[var(--kv-accent,#e50914)] text-white'
                        : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
            {errors.genres && <p className="mt-1 text-xs text-rose-500">{errors.genres}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Cast (comma-separated)
              </label>
              <input
                type="text"
                value={castInput}
                onChange={(e) => setCastInput(e.target.value)}
                placeholder="Elena Vance, Marcus Thorne"
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-xs dark:border-zinc-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="space, 4k, noir"
                className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-xs dark:border-zinc-700"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Flags & Live Card Preview */}
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Publishing &amp; Flags
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Status</label>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as TitleStatus }))}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium">Featured</span>
                <input
                  type="checkbox"
                  checked={draft.isFeatured}
                  onChange={(e) => setDraft((d) => ({ ...d, isFeatured: e.target.checked }))}
                  className="accent-[var(--kv-accent,#e50914)]"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium">Trending</span>
                <input
                  type="checkbox"
                  checked={draft.isTrending}
                  onChange={(e) => setDraft((d) => ({ ...d, isTrending: e.target.checked }))}
                  className="accent-[var(--kv-accent,#e50914)]"
                />
              </label>
              <label className="flex items-center justify-between gap-3 pt-1">
                <div>
                  <span className="block text-xs font-medium">Require Sign-In to Watch</span>
                  <span className="block text-[11px] text-zinc-500">
                    {draft.requiredPlanId
                      ? 'Already required for active subscription plans.'
                      : draft.requiresSignIn
                      ? 'Guests are asked to sign in before watching (free once signed in).'
                      : 'Public viewers can watch immediately without signing in.'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(draft.requiresSignIn || draft.requiredPlanId)}
                  disabled={Boolean(draft.requiredPlanId)}
                  aria-label="Require Sign-In to Watch"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, requiresSignIn: e.target.checked }))
                  }
                  className="shrink-0 accent-[var(--kv-accent,#e50914)]"
                />
              </label>
              <div>
                <label htmlFor="movie-required-plan" className="mb-1 block text-xs text-zinc-500">
                  Subscription Plan Access
                </label>
                <select
                  id="movie-required-plan"
                  value={draft.requiredPlanId ?? ''}
                  onChange={(e) => {
                    const planId = e.target.value || null;
                    const chosen = planId ? plans.find((p) => p.id === planId) : null;
                    setDraft((d) => ({
                      ...d,
                      requiredPlanId: planId,
                      requiredPlanName: chosen ? chosen.name : null,
                      isPremium: Boolean(planId),
                    }));
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Free — No paid subscription needed</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatMonthlyPrice(p.pricePerMonth, p.currency)})
                      {!p.isActive ? ' [Inactive]' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {draft.requiredPlanId
                    ? `Only subscribers to "${draft.requiredPlanName}" can play this video.`
                    : draft.requiresSignIn
                    ? 'Free for signed-in users; guests will be prompted to sign in.'
                    : 'Open to all viewers with no sign-in or subscription.'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Live Card Preview
            </h3>
            <div className="mx-auto w-44">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-zinc-900">
                <img
                  src={draft.posterUrl}
                  alt={draft.title || 'Preview'}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                {(draft.requiredPlanId || draft.isPremium) ? (
                  <span className="absolute left-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">
                    {draft.requiredPlanName || 'Plus'}
                  </span>
                ) : draft.requiresSignIn ? (
                  <span className="absolute left-2 top-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white border border-white/20">
                    Sign In
                  </span>
                ) : null}
              </div>
              <p className="mt-2 truncate font-display text-sm font-semibold">
                {draft.title || 'Untitled Film'}
              </p>
              <p className="text-xs text-zinc-500 tabular-nums">
                {draft.releaseYear} · {draft.rating.toFixed(1)} · {draft.genres[0] ?? 'Cinema'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-xs font-semibold dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-[var(--kv-accent,#e50914)] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Title'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
