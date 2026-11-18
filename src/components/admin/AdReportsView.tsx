import React, { useMemo, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  Printer,
  Search,
} from 'lucide-react';
import type {
  AdEventItem,
  AdPlacementType,
  CustomAdItem,
  MovieItem,
  VastAdItem,
} from '../../types/streaming';
import {
  buildCustomAdReportTable,
  buildVastAdReportTable,
  computeAdMetrics,
  computeAdStatus,
  generateAdsReportCsv,
  generateAdsReportExcelHtml,
  summarizeAdEventsByDay,
} from '../../utils/adEngine';
import { formatCompactNumber } from '../../utils/catalog';
import { Modal } from '../ui/Modal';

interface AdReportsViewProps {
  customAds: CustomAdItem[];
  vastAds: VastAdItem[];
  adEvents: AdEventItem[];
  movies: MovieItem[];
  adminName: string;
}

export const AdReportsView: React.FC<AdReportsViewProps> = ({
  customAds,
  vastAds,
  adEvents,
  movies,
  adminName,
}) => {
  const [kindFilter, setKindFilter] = useState<'all' | 'custom' | 'vast'>('all');
  const [placementFilter, setPlacementFilter] = useState<'all' | AdPlacementType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailTarget, setDetailTarget] = useState<
    | { kind: 'custom'; ad: CustomAdItem }
    | { kind: 'vast'; ad: VastAdItem }
    | null
  >(null);

  const moviesMap = useMemo(() => {
    const map: Record<string, string> = {};
    movies.forEach((m) => {
      map[m.id] = m.title;
    });
    return map;
  }, [movies]);

  const resolveTargetNames = (ids: string[]) =>
    ids.map((id) => moviesMap[id] || id).join(', ');

  const filteredCustom = useMemo(() => {
    if (kindFilter === 'vast') return [];
    const q = search.trim().toLowerCase();
    return customAds.filter((ad) => {
      if (placementFilter !== 'all' && ad.placement !== placementFilter) return false;
      const st = computeAdStatus(ad);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (dateFrom && ad.endDate < dateFrom) return false;
      if (dateTo && ad.startDate > dateTo) return false;
      if (q && !ad.name.toLowerCase().includes(q) && !ad.redirectUrl.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [customAds, kindFilter, placementFilter, statusFilter, search, dateFrom, dateTo]);

  const filteredVast = useMemo(() => {
    if (kindFilter === 'custom') return [];
    if (placementFilter === 'home' || placementFilter === 'banner') return [];
    const q = search.trim().toLowerCase();
    return vastAds.filter((ad) => {
      const st = computeAdStatus(ad);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (dateFrom && ad.endDate < dateFrom) return false;
      if (dateTo && ad.startDate > dateTo) return false;
      if (q && !ad.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vastAds, kindFilter, placementFilter, statusFilter, search, dateFrom, dateTo]);

  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCustom = (fmt: 'csv' | 'html') => {
    const { headers, rows } = buildCustomAdReportTable(filteredCustom, resolveTargetNames);
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'csv') {
      downloadBlob(
        generateAdsReportCsv('Custom Ads Report', adminName, headers, rows),
        `Custom_Ads_Report_${stamp}.csv`,
        'text/csv'
      );
    } else {
      downloadBlob(
        generateAdsReportExcelHtml('Custom Ads Report', adminName, headers, rows),
        `Castads_${stamp}.html`,
        'text/html'
      );
    }
  };

  const handleExportVast = (fmt: 'csv' | 'html') => {
    const { headers, rows } = buildVastAdReportTable(filteredVast, resolveTargetNames);
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'csv') {
      downloadBlob(
        generateAdsReportCsv('VAST Ads Report', adminName, headers, rows),
        `VAST_Ads_Report_${stamp}.csv`,
        'text/csv'
      );
    } else {
      downloadBlob(
        generateAdsReportExcelHtml('VAST Ads Report', adminName, headers, rows),
        `VAST_Ads_${stamp}.html`,
        'text/html'
      );
    }
  };

  const detailEvents = useMemo(() => {
    if (!detailTarget) return [];
    return adEvents.filter((e) => e.adId === detailTarget.ad.id);
  }, [detailTarget, adEvents]);

  const detailDaily = useMemo(() => summarizeAdEventsByDay(detailEvents, 7), [detailEvents]);

  const detailByDevice = useMemo(() => {
    const counts = { desktop: 0, mobile: 0, tablet: 0 };
    detailEvents.forEach((e) => {
      if (e.event === 'impression') {
        counts[e.device] = (counts[e.device] || 0) + 1;
      }
    });
    return counts;
  }, [detailEvents]);

  return (
    <div className="space-y-5">
      {/* Filter & Export Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#13131c]">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaign..."
              className="rounded-lg border border-zinc-300 bg-transparent py-1.5 pl-8 pr-3 text-xs dark:border-zinc-700"
            />
          </div>

          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | 'custom' | 'vast')}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">All Ad Types</option>
            <option value="custom">Custom Image Ads</option>
            <option value="vast">VAST Video Ads</option>
          </select>

          <select
            value={placementFilter}
            onChange={(e) => setPlacementFilter(e.target.value as 'all' | AdPlacementType)}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">All Placements</option>
            <option value="home">Home Page</option>
            <option value="banner">Banner</option>
            <option value="player">Player</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as 'all' | 'active' | 'scheduled' | 'expired' | 'inactive'
              )
            }
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>

          <input
            type="date"
            aria-label="Filter from date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
          />
          <input
            type="date"
            aria-label="Filter to date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-xs dark:border-zinc-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExportCustom('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            Custom CSV
          </button>
          <button
            type="button"
            onClick={() => handleExportCustom('html')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Custom Excel HTML
          </button>
          <button
            type="button"
            onClick={() => handleExportVast('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            VAST CSV
          </button>
          <button
            type="button"
            onClick={() => handleExportVast('html')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            VAST Excel HTML
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--kv-accent,#e50914)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Report
          </button>
        </div>
      </div>

      {/* Custom Image Ads Report Table */}
      {kindFilter !== 'vast' && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#13131c]">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h3 className="font-display text-sm font-bold">
              Custom Ads Report ({filteredCustom.length})
            </h3>
            <p className="text-[11px] text-zinc-500">
              Export includes 4-row sheet header: Report Title · Generated By: {adminName} · Generated On · Columns
            </p>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Placement</th>
                <th className="p-3">Target</th>
                <th className="p-3">Dates</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Impressions</th>
                <th className="p-3 text-right">Clicks</th>
                <th className="p-3 text-right">CTR</th>
                <th className="p-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredCustom.map((ad) => {
                const metrics = computeAdMetrics(ad);
                const computed = computeAdStatus(ad);
                return (
                  <tr key={ad.id}>
                    <td className="p-3 font-semibold">{ad.name}</td>
                    <td className="p-3 capitalize">{ad.placement === 'home' ? 'Home Page' : ad.placement}</td>
                    <td className="p-3 text-zinc-500">
                      {ad.placement === 'home'
                        ? 'Global Home'
                        : resolveTargetNames(ad.targetIds) || `All ${ad.targetContentType}`}
                    </td>
                    <td className="font-mono-tabular p-3 text-zinc-500">
                      {ad.startDate.slice(0, 10)} → {ad.endDate.slice(0, 10)}
                    </td>
                    <td className="p-3 capitalize font-medium">{computed}</td>
                    <td className="font-mono-tabular p-3 text-right">{formatCompactNumber(ad.impressions)}</td>
                    <td className="font-mono-tabular p-3 text-right">{formatCompactNumber(ad.clicks)}</td>
                    <td className="font-mono-tabular p-3 text-right font-semibold">{metrics.ctrPct}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailTarget({ kind: 'custom', ad })}
                        className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredCustom.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-zinc-500">
                    No Custom Ads match current report filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VAST Ads Report Table */}
      {kindFilter !== 'custom' && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#13131c]">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h3 className="font-display text-sm font-bold">
              VAST Ads Report ({filteredVast.length})
            </h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Target</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Impressions</th>
                <th className="p-3 text-right">Completions</th>
                <th className="p-3 text-right">Clicks</th>
                <th className="p-3 text-right">CTR</th>
                <th className="p-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredVast.map((ad) => {
                const metrics = computeAdMetrics(ad);
                const computed = computeAdStatus(ad);
                return (
                  <tr key={ad.id}>
                    <td className="p-3 font-semibold">{ad.name}</td>
                    <td className="p-3 capitalize">{ad.type}</td>
                    <td className="p-3 text-zinc-500">
                      {resolveTargetNames(ad.targetIds) || `All ${ad.targetType}`}
                    </td>
                    <td className="p-3 capitalize font-medium">{computed}</td>
                    <td className="font-mono-tabular p-3 text-right">{formatCompactNumber(ad.impressions)}</td>
                    <td className="font-mono-tabular p-3 text-right">
                      {formatCompactNumber(ad.completions)} ({metrics.completionRatePct})
                    </td>
                    <td className="font-mono-tabular p-3 text-right">{formatCompactNumber(ad.clicks)}</td>
                    <td className="font-mono-tabular p-3 text-right font-semibold">{metrics.ctrPct}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailTarget({ kind: 'vast', ad })}
                        className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredVast.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-zinc-500">
                    No VAST Ads match current report filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-Ad Detail Drilldown Modal */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title={detailTarget ? `Campaign Analytics — ${detailTarget.ad.name}` : 'Analytics'}
        maxWidthClass="max-w-2xl"
      >
        {detailTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">Total Impressions</p>
                <p className="font-mono-tabular mt-1 text-lg font-bold">
                  {detailTarget.ad.impressions.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">Total Clicks</p>
                <p className="font-mono-tabular mt-1 text-lg font-bold">
                  {detailTarget.ad.clicks.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500">CTR</p>
                <p className="font-mono-tabular mt-1 text-lg font-bold">
                  {computeAdMetrics(detailTarget.ad).ctrPct}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h4 className="mb-3 text-xs font-semibold">Recent 7-Day Telemetry Events</h4>
              <div className="grid grid-cols-7 gap-2 items-end h-28">
                {detailDaily.map((d) => {
                  const maxImp = Math.max(1, ...detailDaily.map((x) => x.impressions));
                  const h = Math.round((d.impressions / maxImp) * 80);
                  return (
                    <div key={d.date} className="flex flex-col items-center gap-1">
                      <span className="font-mono-tabular text-[10px] text-zinc-400">{d.impressions}</span>
                      <div className="w-full max-w-[28px] rounded-t bg-[var(--kv-accent,#e50914)]/80" style={{ height: `${Math.max(4, h)}px` }} />
                      <span className="text-[10px] text-zinc-500">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
              <p className="mb-2 font-semibold">Impressions by Device (from recorded events)</p>
              <div className="flex gap-6 font-mono-tabular text-zinc-500">
                <span>Desktop: {detailByDevice.desktop}</span>
                <span>Mobile: {detailByDevice.mobile}</span>
                <span>Tablet: {detailByDevice.tablet}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
